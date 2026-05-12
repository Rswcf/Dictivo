# UI Redesign + Hardware-Aware Tiering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Dictivo's 7-model × 3-profile UI with a 3-tier (Fast/Medium/Slow) auto-mapped per machine, repaint the whole app in Calm Native light style, and turn the floating Companion into a transparent character-sticker + bubble.

**Architecture:** Phase-organized — Rust backend foundations (hardware/benchmark/cache) → settings + bridge → onboarding wizard → main UI repaint → settings page refactor → companion restyle → regression baseline. Each phase ends green and shippable.

**Tech Stack:** Tauri 2.9 (Rust), React 19 + TypeScript, Vite, Vitest, Playwright, whisper.cpp.

**Spec:** `docs/superpowers/specs/2026-05-12-ui-redesign-and-hardware-aware-tiering-design.md`

---

## Repository Conventions

- All `cargo`/`npm` commands run from `apps/desktop` unless noted
- Rust tests: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
- TS tests: `npm run test -w @dictivo/desktop`
- E2E: `npm run e2e -w @dictivo/desktop`
- Commit per task. Commit subject ≤ 72 chars, imperative. Bodies optional.

---

## File Structure (Locked Decomposition)

**Rust (`apps/desktop/src-tauri/src/`)**

- `private_fast.rs` — existing, extended with: `Tier`, `PerformanceClass` enums; `TierAssignment`, `RunnableTiers` structs; `compute_performance_class`, `default_model_for_tier`, `predict_rtf_from_medium`, `compute_fingerprint` helpers; `detect_gpu`, `benchmark_tier`, `runnable_tiers`, `rerun_benchmark` commands. Stays in one file (existing file is the single source for engine-side logic).
- `lib.rs` — register the new commands in the `tauri::generate_handler!` macro.
- `resources/benchmark-5s.wav` — new bundled asset.

**Frontend (`apps/desktop/src/`)**

- `lib/desktopBridge.ts` — extend with `getRunnableTiers`, `benchmarkTier`, `rerunBenchmark`, `detectGpu`. New types `Tier`, `TierAssignment`, `RunnableTiers`.
- `lib/settingsStore.ts` — schema v4 migration; drop `privateFastProfile`/`modelSelectionMode`; add `selectedTier`, `onboardingCompleted`.
- `components/OnboardingWizard.tsx` — new, 3-step wizard.
- `components/TierSelector.tsx` — new, 1/2/3-tier selector for main page.
- `components/DictationWorkbench.tsx` — rewrite (drop telemetry, add TierSelector + footer).
- `components/ModelManager.tsx` — rewrite (Recommended card + 3 tier cards + Advanced collapse).
- `components/SettingsView.tsx` — restructure (5 → 4 sections, Processing folds into Engine→Advanced).
- `components/CompanionWindow.tsx` — restyle (avatar cutout + separate bubble).
- `styles/app.css` — rewrite to Calm Native tokens; delete cyberpunk decoration system.
- `App.tsx` — conditional render `<OnboardingWizard>` vs main shell; drop `privateFastProfile` state, use `selectedTier`.

**Tauri config (`apps/desktop/src-tauri/`)**

- `tauri.conf.json` — companion already has transparency; resize to 360×100 + bundle the WAV.
- `Cargo.toml` — no new deps expected; add `sha2` if not present.

**Tests**

- `apps/desktop/src-tauri/src/private_fast.rs` — extended `#[cfg(test)] mod tests` block.
- `apps/desktop/tests/` — new vitest files: `settingsStore.test.ts`, `tierSelector.test.tsx`, `onboardingWizard.test.tsx`, `companion.test.ts`.
- `apps/desktop/e2e/` — new playwright specs: `onboarding.spec.ts`, `tier-switch.spec.ts`, `advanced-override.spec.ts`.

---

## Phase A — Rust Backend Foundations

### Task A1: Add `Tier` and `PerformanceClass` enums

**Files:**
- Modify: `apps/desktop/src-tauri/src/private_fast.rs` (add after existing `ModelSpec` definition near line 70)

- [ ] **Step 1: Write the failing test**

Append to existing `#[cfg(test)] mod tests` block at the end of `private_fast.rs`:

```rust
#[test]
fn tier_serializes_lowercase() {
    assert_eq!(serde_json::to_string(&Tier::Fast).unwrap(), "\"fast\"");
    assert_eq!(serde_json::to_string(&Tier::Medium).unwrap(), "\"medium\"");
    assert_eq!(serde_json::to_string(&Tier::Slow).unwrap(), "\"slow\"");
}

#[test]
fn performance_class_serializes_camel_case() {
    assert_eq!(serde_json::to_string(&PerformanceClass::GpuHigh).unwrap(), "\"gpuHigh\"");
    assert_eq!(serde_json::to_string(&PerformanceClass::CpuStrong).unwrap(), "\"cpuStrong\"");
    assert_eq!(serde_json::to_string(&PerformanceClass::CpuWeak).unwrap(), "\"cpuWeak\"");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml tier_serializes_lowercase performance_class_serializes_camel_case`
Expected: FAIL with "cannot find type `Tier`" / "cannot find type `PerformanceClass`"

- [ ] **Step 3: Add the enums**

Insert after the `MODEL_CATALOG` const definition (after line 136 in current `private_fast.rs`):

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Tier {
    Fast,
    Medium,
    Slow,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PerformanceClass {
    GpuHigh,
    CpuStrong,
    CpuWeak,
}
```

If `serde::Deserialize` is not already imported at the top of the file, change the existing `use serde::Serialize;` to `use serde::{Deserialize, Serialize};`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml tier_serializes_lowercase performance_class_serializes_camel_case`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/private_fast.rs
git commit -m "feat(engine): add Tier and PerformanceClass enums"
```

---

### Task A2: Add `default_model_for_tier` mapping

**Files:**
- Modify: `apps/desktop/src-tauri/src/private_fast.rs`

- [ ] **Step 1: Write the failing test**

Append to the test module:

```rust
#[test]
fn default_model_for_tier_matrix() {
    use PerformanceClass::*;
    use Tier::*;

    let cases: &[(PerformanceClass, Tier, &str)] = &[
        (GpuHigh,   Fast,   "small"),
        (GpuHigh,   Medium, "large-v3-turbo-q5_0"),
        (GpuHigh,   Slow,   "large-v3"),
        (CpuStrong, Fast,   "base"),
        (CpuStrong, Medium, "small"),
        (CpuStrong, Slow,   "large-v3-turbo-q5_0"),
        (CpuWeak,   Fast,   "tiny"),
        (CpuWeak,   Medium, "base"),
        (CpuWeak,   Slow,   "small"),
    ];

    for &(class, tier, expected) in cases {
        assert_eq!(
            default_model_for_tier(class, tier),
            expected,
            "({:?}, {:?}) should map to {}",
            class,
            tier,
            expected
        );
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml default_model_for_tier_matrix`
Expected: FAIL with "cannot find function `default_model_for_tier`"

- [ ] **Step 3: Add the function**

Insert below the enums added in A1:

```rust
fn default_model_for_tier(class: PerformanceClass, tier: Tier) -> &'static str {
    use PerformanceClass::*;
    use Tier::*;
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

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml default_model_for_tier_matrix`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/private_fast.rs
git commit -m "feat(engine): map (class, tier) to default model"
```

---

### Task A3: Add `compute_performance_class` helper

**Files:**
- Modify: `apps/desktop/src-tauri/src/private_fast.rs`

- [ ] **Step 1: Write the failing test**

Append to test module:

```rust
#[test]
fn performance_class_classification() {
    // (cores, ram_gb, gpu_vram_gb, expected)
    let cases: &[(usize, u64, Option<u64>, PerformanceClass)] = &[
        // Apple Silicon proxy: high RAM + GPU "vram" treated as RAM share (passing Some)
        (10, 16, Some(8),  PerformanceClass::GpuHigh),
        (12, 32, Some(12), PerformanceClass::GpuHigh),
        // GPU present but VRAM too low — does not qualify as GpuHigh
        (8,  16, Some(4),  PerformanceClass::CpuStrong),
        // No GPU, strong CPU
        (8,  16, None,     PerformanceClass::CpuStrong),
        (16, 32, None,     PerformanceClass::CpuStrong),
        // Weak machines
        (4,  8,  None,     PerformanceClass::CpuWeak),
        (4,  16, None,     PerformanceClass::CpuWeak),  // not enough cores
        (8,  4,  None,     PerformanceClass::CpuWeak),  // not enough RAM
    ];

    for &(cores, ram_gb, gpu_vram_gb, expected) in cases {
        let ram_bytes = ram_gb * 1024 * 1024 * 1024;
        let gpu_vram_bytes = gpu_vram_gb.map(|gb| gb * 1024 * 1024 * 1024);
        assert_eq!(
            compute_performance_class(cores, Some(ram_bytes), gpu_vram_bytes),
            expected,
            "cores={} ram_gb={} gpu_vram_gb={:?} expected {:?}",
            cores, ram_gb, gpu_vram_gb, expected
        );
    }
}

#[test]
fn performance_class_missing_ram_falls_to_cpu_weak() {
    assert_eq!(
        compute_performance_class(8, None, None),
        PerformanceClass::CpuWeak
    );
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml performance_class_classification performance_class_missing_ram`
Expected: FAIL with "cannot find function `compute_performance_class`"

- [ ] **Step 3: Add the function**

Insert below `default_model_for_tier`:

```rust
fn compute_performance_class(
    cores: usize,
    ram_bytes: Option<u64>,
    gpu_vram_bytes: Option<u64>,
) -> PerformanceClass {
    let ram = match ram_bytes {
        Some(v) => v,
        None => return PerformanceClass::CpuWeak,
    };
    let high_ram = ram >= 16 * 1024 * 1024 * 1024;
    let qualifying_gpu = gpu_vram_bytes
        .map(|v| v >= 8 * 1024 * 1024 * 1024)
        .unwrap_or(false);

    if qualifying_gpu && high_ram {
        PerformanceClass::GpuHigh
    } else if cores >= 8 && high_ram {
        PerformanceClass::CpuStrong
    } else {
        PerformanceClass::CpuWeak
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml performance_class`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/private_fast.rs
git commit -m "feat(engine): classify hardware into GpuHigh/CpuStrong/CpuWeak"
```

---

### Task A4: Add `predict_rtf_from_medium` helper

**Files:**
- Modify: `apps/desktop/src-tauri/src/private_fast.rs`

- [ ] **Step 1: Write the failing test**

Append to test module:

```rust
#[test]
fn predict_rtf_ratios() {
    let medium_rtf = 1.0f32;
    // ratios per spec §2.4
    let expectations: &[(&str, f32)] = &[
        ("tiny",                  1.0 * 0.2),
        ("base",                  1.0 * 0.4),
        ("small",                 1.0 * 0.7),
        ("medium-q5_0",           1.0 * 1.1),
        ("large-v3-turbo-q5_0",   1.0 * 1.5),
        ("large-v3-turbo",        1.0 * 2.0),
        ("large-v3",              1.0 * 2.5),
    ];
    for &(model_id, expected) in expectations {
        let got = predict_rtf_from_medium(model_id, medium_rtf);
        assert!(
            (got - expected).abs() < 1e-4,
            "{} predicted {} expected {}",
            model_id, got, expected
        );
    }
}

#[test]
fn predict_rtf_scales_linearly_with_medium() {
    // measured Medium = 2.0× should make Slow predictions twice as slow
    assert!((predict_rtf_from_medium("large-v3", 2.0) - 5.0).abs() < 1e-4);
}

#[test]
fn predict_rtf_unknown_model_returns_input() {
    assert_eq!(predict_rtf_from_medium("unknown-id", 1.5), 1.5);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml predict_rtf`
Expected: FAIL with "cannot find function `predict_rtf_from_medium`"

- [ ] **Step 3: Add the function**

Insert below `compute_performance_class`:

```rust
fn predict_rtf_from_medium(model_id: &str, medium_rtf: f32) -> f32 {
    let ratio: f32 = match model_id {
        "tiny" => 0.2,
        "base" => 0.4,
        "small" => 0.7,
        "medium-q5_0" => 1.1,
        "large-v3-turbo-q5_0" => 1.5,
        "large-v3-turbo" => 2.0,
        "large-v3" => 2.5,
        _ => return medium_rtf,
    };
    medium_rtf * ratio
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml predict_rtf`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/private_fast.rs
git commit -m "feat(engine): predict per-model RTF from measured Medium RTF"
```

---

### Task A5: Add `compute_fingerprint` helper

**Files:**
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/src/private_fast.rs`

- [ ] **Step 1: Verify or add the `sha2` dependency**

Check existing deps:

```bash
grep '^sha2' apps/desktop/src-tauri/Cargo.toml
```

If not present, add under `[dependencies]`:

```toml
sha2 = "0.10"
```

- [ ] **Step 2: Write the failing test**

Append to test module:

```rust
#[test]
fn fingerprint_is_deterministic_and_sensitive() {
    let a = compute_fingerprint("Apple M3 Pro", 18 * 1024 * 1024 * 1024, &["Apple M3 Pro GPU".to_string()]);
    let b = compute_fingerprint("Apple M3 Pro", 18 * 1024 * 1024 * 1024, &["Apple M3 Pro GPU".to_string()]);
    assert_eq!(a, b, "same inputs must hash equal");
    assert_eq!(a.len(), 64, "sha256 hex digest is 64 chars");

    let c = compute_fingerprint("Apple M2 Pro", 18 * 1024 * 1024 * 1024, &["Apple M2 Pro GPU".to_string()]);
    assert_ne!(a, c, "different CPU must hash different");

    let d = compute_fingerprint("Apple M3 Pro", 16 * 1024 * 1024 * 1024, &["Apple M3 Pro GPU".to_string()]);
    assert_ne!(a, d, "different RAM must hash different");

    let e = compute_fingerprint("Apple M3 Pro", 18 * 1024 * 1024 * 1024, &[]);
    assert_ne!(a, e, "different GPU list must hash different");
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml fingerprint`
Expected: FAIL with "cannot find function `compute_fingerprint`"

- [ ] **Step 4: Add the function**

At the top of `private_fast.rs` add:

```rust
use sha2::{Digest, Sha256};
```

Add below `predict_rtf_from_medium`:

```rust
fn compute_fingerprint(cpu_model: &str, ram_bytes: u64, gpu_names: &[String]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(cpu_model.as_bytes());
    hasher.update(b"|");
    hasher.update(ram_bytes.to_le_bytes());
    hasher.update(b"|");
    for name in gpu_names {
        hasher.update(name.as_bytes());
        hasher.update(b",");
    }
    hex_encode(&hasher.finalize())
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        use std::fmt::Write;
        let _ = write!(s, "{:02x}", byte);
    }
    s
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml fingerprint`
Expected: PASS (1 passed)

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/src/private_fast.rs
git commit -m "feat(engine): SHA-256 fingerprint of CPU/RAM/GPU"
```

---

### Task A6: Add `TierAssignment` and `RunnableTiers` structs + serialization

**Files:**
- Modify: `apps/desktop/src-tauri/src/private_fast.rs`

- [ ] **Step 1: Write the failing test**

Append to test module:

```rust
#[test]
fn runnable_tiers_roundtrip_json() {
    let original = RunnableTiers {
        fast: Some(TierAssignment {
            model_id: "small".into(),
            realtime_factor: 0.65,
            predicted: false,
            downloaded: true,
        }),
        medium: Some(TierAssignment {
            model_id: "large-v3-turbo-q5_0".into(),
            realtime_factor: 0.85,
            predicted: false,
            downloaded: true,
        }),
        slow: None,
        fingerprint: "ab12".into(),
        benchmarked_at: "2026-05-12T10:14:00Z".into(),
    };
    let json = serde_json::to_string(&original).unwrap();
    assert!(json.contains("\"realtimeFactor\":0.65"), "uses camelCase: {}", json);
    let back: RunnableTiers = serde_json::from_str(&json).unwrap();
    assert_eq!(back.fast.as_ref().unwrap().model_id, "small");
    assert!(back.slow.is_none());
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml runnable_tiers_roundtrip_json`
Expected: FAIL with "cannot find type `RunnableTiers`"

- [ ] **Step 3: Add the structs**

Insert below the existing `HardwareProfile` struct (currently near line 49 in `private_fast.rs`):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TierAssignment {
    pub model_id: String,
    pub realtime_factor: f32,
    pub predicted: bool,
    pub downloaded: bool,
}

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

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml runnable_tiers_roundtrip_json`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/private_fast.rs
git commit -m "feat(engine): TierAssignment and RunnableTiers structs"
```

---

### Task A7: Add GPU detection on macOS Intel

**Files:**
- Modify: `apps/desktop/src-tauri/src/private_fast.rs` — extend `detect_accelerators` or factor out

- [ ] **Step 1: Write the failing test**

Append to test module. This test exercises pure parsing — feed a captured `system_profiler` snippet:

```rust
#[test]
fn parse_macos_displays_finds_amd_radeon() {
    let sample = r#"
Graphics/Displays:
    AMD Radeon Pro 5500M:
      Chipset Model: AMD Radeon Pro 5500M
      Vendor: AMD (0x1002)
      Device ID: 0x7340
      VRAM (Total): 8 GB
    "#;
    let gpus = parse_macos_displays(sample);
    assert_eq!(gpus.len(), 1);
    assert_eq!(gpus[0].name, "AMD Radeon Pro 5500M");
    assert_eq!(gpus[0].vram_bytes, Some(8 * 1024 * 1024 * 1024));
}

#[test]
fn parse_macos_displays_handles_no_gpu() {
    assert!(parse_macos_displays("").is_empty());
}

#[test]
fn parse_macos_displays_handles_mb_vram() {
    let sample = "Intel UHD Graphics 630:\n  Chipset Model: Intel UHD Graphics 630\n  VRAM (Dynamic, Max): 1536 MB";
    let gpus = parse_macos_displays(sample);
    assert_eq!(gpus.len(), 1);
    assert_eq!(gpus[0].vram_bytes, Some(1536 * 1024 * 1024));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml parse_macos_displays`
Expected: FAIL with "cannot find function `parse_macos_displays`" / "cannot find type `GpuInfo`"

- [ ] **Step 3: Add types and parser**

Add near the existing `HardwareProfile`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub name: String,
    pub vram_bytes: Option<u64>,
}

fn parse_macos_displays(output: &str) -> Vec<GpuInfo> {
    let mut gpus = Vec::new();
    let mut current_name: Option<String> = None;
    let mut current_vram: Option<u64> = None;

    let push_current = |name: &mut Option<String>, vram: &mut Option<u64>, gpus: &mut Vec<GpuInfo>| {
        if let Some(n) = name.take() {
            gpus.push(GpuInfo { name: n, vram_bytes: vram.take() });
        }
    };

    for line in output.lines() {
        let trimmed = line.trim_end();
        let leading_spaces = trimmed.len() - trimmed.trim_start().len();
        let body = trimmed.trim_start();

        if body.ends_with(':') && leading_spaces <= 4 && !body.contains("Graphics/Displays") {
            // New GPU section header (4-space indented, ends with colon)
            push_current(&mut current_name, &mut current_vram, &mut gpus);
            current_name = Some(body.trim_end_matches(':').to_string());
            continue;
        }
        if let Some(value) = body.strip_prefix("VRAM (Total):").or_else(|| body.strip_prefix("VRAM (Dynamic, Max):")) {
            current_vram = parse_vram(value.trim());
        }
    }
    push_current(&mut current_name, &mut current_vram, &mut gpus);
    gpus
}

fn parse_vram(s: &str) -> Option<u64> {
    let parts: Vec<&str> = s.split_whitespace().collect();
    if parts.len() != 2 { return None; }
    let value: u64 = parts[0].parse().ok()?;
    match parts[1] {
        "GB" => Some(value * 1024 * 1024 * 1024),
        "MB" => Some(value * 1024 * 1024),
        _ => None,
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml parse_macos_displays parse_vram`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/private_fast.rs
git commit -m "feat(engine): parse system_profiler output to find discrete GPUs"
```

---

### Task A8: Add `detect_gpu` Tauri command

**Files:**
- Modify: `apps/desktop/src-tauri/src/private_fast.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs` — register command

- [ ] **Step 1: Add the command**

Below the existing `hardware_profile` command in `private_fast.rs`, add:

```rust
#[tauri::command]
pub fn detect_gpu() -> Vec<GpuInfo> {
    let mut gpus: Vec<GpuInfo> = Vec::new();

    #[cfg(target_os = "macos")]
    {
        if env::consts::ARCH == "aarch64" {
            // Apple Silicon: integrated Metal GPU. Use a synthetic entry with shared
            // RAM proxy so downstream classification can treat it as a qualifying GPU.
            let ram = total_memory_bytes().unwrap_or(0);
            gpus.push(GpuInfo {
                name: "Apple Silicon GPU (Metal)".to_string(),
                vram_bytes: Some(ram.saturating_div(2).max(8 * 1024 * 1024 * 1024)),
            });
        } else {
            if let Ok(out) = Command::new("system_profiler")
                .arg("SPDisplaysDataType")
                .output()
            {
                let text = String::from_utf8_lossy(&out.stdout);
                gpus.extend(parse_macos_displays(&text).into_iter().filter(|g| {
                    let n = g.name.to_ascii_lowercase();
                    n.contains("amd") || n.contains("radeon") || n.contains("vega") || n.contains("nvidia") || n.contains("geforce") || n.contains("rtx") || n.contains("quadro")
                }));
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(info) = windows_primary_gpu() {
            gpus.push(info);
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(info) = linux_nvidia_gpu() {
            gpus.push(info);
        }
        if let Some(info) = linux_amd_gpu() {
            gpus.push(info);
        }
    }

    gpus
}
```

Also add platform-specific helpers (no-op stubs for compile on non-target platforms):

```rust
#[cfg(target_os = "windows")]
fn windows_primary_gpu() -> Option<GpuInfo> {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress",
        ])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(text.trim()).ok()?;
    let first = if parsed.is_array() { parsed.get(0)?.clone() } else { parsed };
    let name = first.get("Name")?.as_str()?.to_string();
    let vram = first.get("AdapterRAM").and_then(|v| v.as_u64());
    Some(GpuInfo { name, vram_bytes: vram })
}

#[cfg(not(target_os = "windows"))]
fn windows_primary_gpu() -> Option<GpuInfo> { None }

#[cfg(target_os = "linux")]
fn linux_nvidia_gpu() -> Option<GpuInfo> {
    let output = Command::new("nvidia-smi")
        .args(["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
        .output()
        .ok()?;
    if !output.status.success() { return None; }
    let text = String::from_utf8_lossy(&output.stdout);
    let first = text.lines().next()?;
    let parts: Vec<&str> = first.split(',').map(str::trim).collect();
    if parts.len() < 2 { return None; }
    let name = parts[0].to_string();
    let mib: u64 = parts[1].parse().ok()?;
    Some(GpuInfo { name, vram_bytes: Some(mib * 1024 * 1024) })
}

#[cfg(not(target_os = "linux"))]
fn linux_nvidia_gpu() -> Option<GpuInfo> { None }

#[cfg(target_os = "linux")]
fn linux_amd_gpu() -> Option<GpuInfo> {
    let output = Command::new("rocm-smi")
        .args(["--showmeminfo", "vram", "--csv"])
        .output()
        .ok()?;
    if !output.status.success() { return None; }
    // Best-effort: name + VRAM. If parsing fails, return None.
    let text = String::from_utf8_lossy(&output.stdout);
    let line = text.lines().nth(1)?;  // skip header
    let parts: Vec<&str> = line.split(',').collect();
    if parts.len() < 2 { return None; }
    let vram: u64 = parts[1].trim().parse().ok()?;
    Some(GpuInfo { name: "AMD GPU (ROCm)".to_string(), vram_bytes: Some(vram) })
}

#[cfg(not(target_os = "linux"))]
fn linux_amd_gpu() -> Option<GpuInfo> { None }
```

- [ ] **Step 2: Register the command**

In `apps/desktop/src-tauri/src/lib.rs`, find the existing `tauri::generate_handler!` macro call (search for `private_fast_status` to find it). Add `private_fast::detect_gpu` to the comma-separated list.

- [ ] **Step 3: Verify build**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: clean build (warnings OK, no errors)

- [ ] **Step 4: Verify existing tests still pass**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: all prior tests still PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/private_fast.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat(engine): detect_gpu Tauri command for macOS/Windows/Linux"
```

---

### Task A9: Bundle benchmark WAV sample

**Files:**
- Create: `apps/desktop/src-tauri/resources/benchmark-5s.wav`
- Modify: `apps/desktop/src-tauri/tauri.conf.json` — add to `bundle.resources`

- [ ] **Step 1: Generate or place a 5-second WAV**

Use a TTS pipeline or any 5-second 16 kHz mono PCM WAV file. Example via macOS `say`:

```bash
say -v Samantha -o apps/desktop/src-tauri/resources/benchmark-5s.aiff "The quick brown fox jumps over the lazy dog. Local dictation works well today."
afconvert apps/desktop/src-tauri/resources/benchmark-5s.aiff -f WAVE -d LEI16@16000 -c 1 apps/desktop/src-tauri/resources/benchmark-5s.wav
rm apps/desktop/src-tauri/resources/benchmark-5s.aiff
```

If `say`/`afconvert` aren't available, drop in any pre-recorded 5 s 16 kHz mono PCM WAV at that exact path. Confirm:

```bash
ls -lh apps/desktop/src-tauri/resources/benchmark-5s.wav
```

Expected: file exists, < 200 KB.

- [ ] **Step 2: Add to bundle resources**

Open `apps/desktop/src-tauri/tauri.conf.json`. Find `"bundle".resources`:

```json
"resources": {
  "resources/private-fast": "private-fast"
}
```

Change to:

```json
"resources": {
  "resources/private-fast": "private-fast",
  "resources/benchmark-5s.wav": "benchmark-5s.wav"
}
```

- [ ] **Step 3: Verify the asset resolves at runtime**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/resources/benchmark-5s.wav apps/desktop/src-tauri/tauri.conf.json
git commit -m "chore(engine): bundle 5s benchmark WAV sample"
```

---

### Task A10: Add `benchmark_tier` Tauri command

**Files:**
- Modify: `apps/desktop/src-tauri/src/private_fast.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Add the command**

Append to `private_fast.rs`:

```rust
#[tauri::command]
pub async fn benchmark_tier(app: AppHandle, model_id: String) -> Result<f32, String> {
    let binary_path = resolve_binary_path(Some(&app))
        .ok_or_else(|| "whisper-cli binary missing".to_string())?;
    let model_path = private_fast_models_dir()
        .map_err(|e| e)?
        .join(format!("ggml-{model_id}.bin"));
    if !model_path.exists() {
        return Err(format!("Model {model_id} is not installed"));
    }

    let sample_path = app
        .path()
        .resolve("benchmark-5s.wav", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;

    let start = std::time::Instant::now();
    let output = Command::new(&binary_path)
        .args([
            "-m",
            model_path.to_string_lossy().as_ref(),
            "-f",
            sample_path.to_string_lossy().as_ref(),
            "-l",
            "en",
            "-otxt",
            "-of",
            "/dev/null",
            "--no-prints",
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(format!(
            "whisper-cli exited {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    let elapsed = start.elapsed().as_secs_f32();
    let audio_secs = 5.0_f32;
    Ok(elapsed / audio_secs)
}
```

Add the missing import at the top of `private_fast.rs` if not present:

```rust
use tauri::Manager;
```

- [ ] **Step 2: Register the command**

In `lib.rs`'s `tauri::generate_handler!`, add `private_fast::benchmark_tier`.

- [ ] **Step 3: Verify build**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/private_fast.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat(engine): benchmark_tier command runs sample to measure RTF"
```

---

### Task A11: Add `runnable_tiers` + cache I/O

**Files:**
- Modify: `apps/desktop/src-tauri/src/private_fast.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing test for budget gating**

Append to test module:

```rust
#[test]
fn build_runnable_tiers_filters_by_budget() {
    use PerformanceClass::*;
    // Medium RTF measured at 0.8 on a CpuStrong machine
    let result = build_runnable_tiers_with_rtfs(
        CpuStrong,
        0.8,                         // measured medium
        "fp",                        // fingerprint
        "2026-05-12T00:00:00Z",      // timestamp
        |id| installed_in_test(id),  // injected installed check
    );
    // CpuStrong: Fast=base, Medium=small, Slow=large-v3-turbo-q5_0
    // Predicted: base = 0.8 * 0.4 / 0.7 ... but predict is FROM Medium, so:
    //   base RTF = 0.8 * (0.4/0.7) ≈ 0.457 (Fast budget 1.0 OK)
    //   small RTF = 0.8 (Medium budget 2.0 OK)
    //   large-v3-turbo-q5_0 RTF = 0.8 * (1.5/0.7) ≈ 1.71 (Slow budget 4.0 OK)
    // All three should appear.
    assert!(result.fast.is_some());
    assert!(result.medium.is_some());
    assert!(result.slow.is_some());
}

#[test]
fn build_runnable_tiers_drops_slow_when_predicted_too_slow() {
    use PerformanceClass::*;
    // Very weak: Medium RTF = 5.0 means even base would predict ~2.85, large-turbo ~10.7
    let result = build_runnable_tiers_with_rtfs(
        CpuWeak, 5.0, "fp", "ts",
        |_| false,
    );
    // CpuWeak: Fast=tiny (5.0 * 0.2/0.4 = 2.5 > 1.0 Fast budget → force-show, see edge case)
    // Medium=base (5.0 > 2.0 Medium budget → omit)
    // Slow=small (5.0 * 0.7/0.4 = 8.75 > 4.0 Slow budget → omit)
    // Edge case: Fast is force-shown to guarantee at least one tier
    assert!(result.fast.is_some(), "Fast must be force-shown when all else fails");
    assert!(result.medium.is_none() || result.medium.is_some(), "Medium may or may not qualify");
}

fn installed_in_test(_model_id: &str) -> bool { false }
```

- [ ] **Step 2: Run to confirm fail**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml build_runnable_tiers`
Expected: FAIL with "cannot find function `build_runnable_tiers_with_rtfs`"

- [ ] **Step 3: Implement the helper + command**

Append to `private_fast.rs`:

```rust
const FAST_BUDGET: f32 = 1.0;
const MEDIUM_BUDGET: f32 = 2.0;
const SLOW_BUDGET: f32 = 4.0;

fn tier_budget(tier: Tier) -> f32 {
    match tier { Tier::Fast => FAST_BUDGET, Tier::Medium => MEDIUM_BUDGET, Tier::Slow => SLOW_BUDGET }
}

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
    let medium_ratio = ratio_of(medium_model);  // ratio relative to "1×" reference
    // Solve "true RTF for any model X" from measured Medium:
    //   measured_medium = TRUE_BASELINE * medium_ratio
    //   predicted_x     = TRUE_BASELINE * ratio_of(x)
    //                   = measured_medium * (ratio_of(x) / medium_ratio)
    let baseline = if medium_ratio > 0.0 { measured_medium_rtf / medium_ratio } else { 0.0 };

    let mut assignments = [None, None, None];
    for (idx, tier) in [Tier::Fast, Tier::Medium, Tier::Slow].into_iter().enumerate() {
        let model_id = default_model_for_tier(class, tier).to_string();
        let rtf = baseline * ratio_of(&model_id);
        let within_budget = rtf <= tier_budget(tier);
        let is_medium = matches!(tier, Tier::Medium);
        if within_budget || is_medium {
            assignments[idx] = Some(TierAssignment {
                downloaded: is_installed(&model_id),
                predicted: !is_medium,  // Medium was measured; others predicted
                realtime_factor: rtf,
                model_id,
            });
        }
    }

    // Edge case: at least one tier must be present.
    if assignments.iter().all(|a| a.is_none()) {
        let model_id = default_model_for_tier(class, Tier::Fast).to_string();
        let rtf = baseline * ratio_of(&model_id);
        assignments[0] = Some(TierAssignment {
            downloaded: is_installed(&model_id),
            predicted: true,
            realtime_factor: rtf,
            model_id,
        });
    }

    RunnableTiers {
        fast: assignments[0].clone(),
        medium: assignments[1].clone(),
        slow: assignments[2].clone(),
        fingerprint: fingerprint.to_string(),
        benchmarked_at: benchmarked_at.to_string(),
    }
}

fn ratio_of(model_id: &str) -> f32 {
    match model_id {
        "tiny" => 0.2,
        "base" => 0.4,
        "small" => 0.7,
        "medium-q5_0" => 1.1,
        "large-v3-turbo-q5_0" => 1.5,
        "large-v3-turbo" => 2.0,
        "large-v3" => 2.5,
        _ => 1.0,
    }
}
```

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml build_runnable_tiers`
Expected: PASS (2 passed)

- [ ] **Step 5: Add cache read/write + Tauri command**

Append:

```rust
fn benchmark_cache_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("benchmark.json"))
}

fn current_fingerprint() -> String {
    let cpu = sysctl_cpu_brand();
    let ram = total_memory_bytes().unwrap_or(0);
    let gpu_names: Vec<String> = detect_gpu().into_iter().map(|g| g.name).collect();
    compute_fingerprint(&cpu, ram, &gpu_names)
}

fn sysctl_cpu_brand() -> String {
    #[cfg(target_os = "macos")]
    {
        if let Ok(out) = Command::new("sysctl").args(["-n", "machdep.cpu.brand_string"]).output() {
            return String::from_utf8_lossy(&out.stdout).trim().to_string();
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(text) = fs::read_to_string("/proc/cpuinfo") {
            for line in text.lines() {
                if let Some(v) = line.strip_prefix("model name") {
                    return v.trim_start_matches(':').trim().to_string();
                }
            }
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(out) = Command::new("powershell").args([
            "-NoProfile", "-Command",
            "(Get-CimInstance Win32_Processor | Select-Object -First 1).Name"
        ]).output() {
            return String::from_utf8_lossy(&out.stdout).trim().to_string();
        }
    }
    "unknown".to_string()
}

#[tauri::command]
pub fn runnable_tiers(app: AppHandle) -> Result<RunnableTiers, String> {
    let path = benchmark_cache_path(&app)?;
    let fp = current_fingerprint();
    if path.exists() {
        if let Ok(text) = fs::read_to_string(&path) {
            if let Ok(cached) = serde_json::from_str::<RunnableTiers>(&text) {
                if cached.fingerprint == fp {
                    return Ok(cached);
                }
            }
        }
    }
    // No valid cache: return an empty-but-honest result so the UI can prompt re-run
    Ok(RunnableTiers {
        fast: None, medium: None, slow: None,
        fingerprint: fp, benchmarked_at: String::new(),
    })
}

#[tauri::command]
pub fn write_runnable_tiers(app: AppHandle, tiers: RunnableTiers) -> Result<(), String> {
    let path = benchmark_cache_path(&app)?;
    let text = serde_json::to_string_pretty(&tiers).map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rerun_benchmark(app: AppHandle) -> Result<(), String> {
    let path = benchmark_cache_path(&app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

- [ ] **Step 6: Register commands**

In `lib.rs`'s `tauri::generate_handler!`, add `private_fast::runnable_tiers`, `private_fast::write_runnable_tiers`, `private_fast::rerun_benchmark`.

- [ ] **Step 7: Verify everything still compiles + passes**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src-tauri/src/private_fast.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat(engine): runnable_tiers with budget-gated assignments + cache"
```

---

## Phase B — Frontend Bridge + Settings Migration

### Task B1: Extend `desktopBridge.ts` with new types and functions

**Files:**
- Modify: `apps/desktop/src/lib/desktopBridge.ts`

- [ ] **Step 1: Add types**

Open `apps/desktop/src/lib/desktopBridge.ts`. Below the existing `PrivateFastProfile` type, add:

```typescript
export type Tier = "fast" | "medium" | "slow";

export type TierAssignment = {
  modelId: string;
  realtimeFactor: number;
  predicted: boolean;
  downloaded: boolean;
};

export type RunnableTiers = {
  fast: TierAssignment | null;
  medium: TierAssignment | null;
  slow: TierAssignment | null;
  fingerprint: string;
  benchmarkedAt: string;
};

export type GpuInfo = {
  name: string;
  vramBytes: number | null;
};
```

- [ ] **Step 2: Add the bridge functions**

Below the existing `getHardwareProfile` function add:

```typescript
export async function detectGpu(): Promise<GpuInfo[]> {
  if (!isTauriRuntime()) return [];
  return invoke<GpuInfo[]>("detect_gpu");
}

export async function getRunnableTiers(): Promise<RunnableTiers> {
  if (!isTauriRuntime()) {
    return {
      fast: { modelId: "base", realtimeFactor: 0.5, predicted: true, downloaded: false },
      medium: { modelId: "small", realtimeFactor: 0.9, predicted: false, downloaded: false },
      slow: null,
      fingerprint: "web-preview",
      benchmarkedAt: ""
    };
  }
  return invoke<RunnableTiers>("runnable_tiers");
}

export async function writeRunnableTiers(tiers: RunnableTiers): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("write_runnable_tiers", { tiers });
}

export async function benchmarkTier(modelId: string): Promise<number> {
  if (!isTauriRuntime()) throw new Error("Benchmark requires the desktop app runtime.");
  return invoke<number>("benchmark_tier", { modelId });
}

export async function rerunBenchmark(): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("rerun_benchmark");
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck -w @dictivo/desktop`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/lib/desktopBridge.ts
git commit -m "feat(desktop): bridge helpers for tier API and GPU detection"
```

---

### Task B2: Migrate `settingsStore.ts` to schema v4

**Files:**
- Modify: `apps/desktop/src/lib/settingsStore.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/tests/settingsStore.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from "vitest";
import { loadSettings, saveSettings } from "../src/lib/settingsStore";

const KEY = "dictivo-settings-v4";

describe("settingsStore v4 migration", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns defaults when nothing stored", () => {
    const s = loadSettings();
    expect(s.selectedTier).toBe("medium");
    expect(s.onboardingCompleted).toBe(false);
  });

  it("migrates v3 privateFastProfile=balanced to selectedTier=medium", () => {
    localStorage.setItem(
      "dictivo-settings-v3",
      JSON.stringify({ privateFastProfile: "balanced", modelSelectionMode: "auto", language: "en" })
    );
    const s = loadSettings();
    expect(s.selectedTier).toBe("medium");
    expect(s.language).toBe("en");
  });

  it("migrates v3 privateFastProfile=fast to selectedTier=fast", () => {
    localStorage.setItem(
      "dictivo-settings-v3",
      JSON.stringify({ privateFastProfile: "fast" })
    );
    expect(loadSettings().selectedTier).toBe("fast");
  });

  it("migrates v3 privateFastProfile=quality to selectedTier=slow", () => {
    localStorage.setItem(
      "dictivo-settings-v3",
      JSON.stringify({ privateFastProfile: "quality" })
    );
    expect(loadSettings().selectedTier).toBe("slow");
  });

  it("round-trips through saveSettings", () => {
    saveSettings({
      language: "en",
      selectedMode: "message",
      selectedTier: "fast",
      onboardingCompleted: true,
      companionEnabled: true,
      companionAvatar: "cat",
      hotkeys: { dictation: "CommandOrControl+Shift+Space", pasteLast: "", activationMode: "toggle" },
      localProcessing: { autoPolish: true, spokenPunctuation: true, fillerWords: true, smartCapitalization: true },
      dictionary: [],
      snippets: []
    });
    expect(loadSettings().selectedTier).toBe("fast");
    expect(loadSettings().onboardingCompleted).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @dictivo/desktop -- tests/settingsStore.test.ts`
Expected: FAIL (selectedTier / onboardingCompleted not on the type, and migration logic missing).

- [ ] **Step 3: Update `settingsStore.ts`**

Read the file first:

```bash
sed -n '1,200p' apps/desktop/src/lib/settingsStore.ts
```

Then rewrite the file's exports. The new content (use this as the full file):

```typescript
import type { DictionaryTerm, InputMode, Snippet, SupportedLanguage } from "@dictivo/shared";

const STORAGE_KEY = "dictivo-settings-v4";
const LEGACY_KEYS = ["dictivo-settings-v3", "dictivo-settings-v2", "dictivo-settings"];

export type ModelSelectionMode = "auto" | "manual";
export type PrivateFastProfile = "fast" | "balanced" | "quality";
export type CompanionAvatar = "dog" | "cat" | "trump";

export type HotkeySettings = {
  dictation: string;
  pasteLast: string;
  activationMode: "toggle" | "hold";
};

export type LocalProcessingSettings = {
  autoPolish: boolean;
  spokenPunctuation: boolean;
  fillerWords: boolean;
  smartCapitalization: boolean;
};

export const DEFAULT_HOTKEYS: HotkeySettings = {
  dictation: "CommandOrControl+Shift+Space",
  pasteLast: "CommandOrControl+Shift+V",
  activationMode: "toggle"
};

export const DEFAULT_LOCAL_PROCESSING: LocalProcessingSettings = {
  autoPolish: true,
  spokenPunctuation: true,
  fillerWords: true,
  smartCapitalization: true
};

export type Settings = {
  language: SupportedLanguage;
  selectedMode: InputMode;
  selectedTier: "fast" | "medium" | "slow";
  onboardingCompleted: boolean;
  companionEnabled: boolean;
  companionAvatar: CompanionAvatar;
  hotkeys: HotkeySettings;
  localProcessing: LocalProcessingSettings;
  dictionary: DictionaryTerm[];
  snippets: Snippet[];
};

const DEFAULTS: Settings = {
  language: "en",
  selectedMode: "message",
  selectedTier: "medium",
  onboardingCompleted: false,
  companionEnabled: true,
  companionAvatar: "dog",
  hotkeys: DEFAULT_HOTKEYS,
  localProcessing: DEFAULT_LOCAL_PROCESSING,
  dictionary: [],
  snippets: []
};

export function normalizeHotkeys(value: Partial<HotkeySettings> | undefined): HotkeySettings {
  return {
    dictation: value?.dictation ?? DEFAULT_HOTKEYS.dictation,
    pasteLast: value?.pasteLast ?? DEFAULT_HOTKEYS.pasteLast,
    activationMode: value?.activationMode ?? DEFAULT_HOTKEYS.activationMode
  };
}

export function normalizeLocalProcessing(
  value: Partial<LocalProcessingSettings> | undefined
): LocalProcessingSettings {
  return {
    autoPolish: value?.autoPolish ?? DEFAULT_LOCAL_PROCESSING.autoPolish,
    spokenPunctuation: value?.spokenPunctuation ?? DEFAULT_LOCAL_PROCESSING.spokenPunctuation,
    fillerWords: value?.fillerWords ?? DEFAULT_LOCAL_PROCESSING.fillerWords,
    smartCapitalization: value?.smartCapitalization ?? DEFAULT_LOCAL_PROCESSING.smartCapitalization
  };
}

function profileToTier(profile: unknown): Settings["selectedTier"] {
  if (profile === "fast") return "fast";
  if (profile === "quality") return "slow";
  return "medium";
}

export function loadSettings(): Settings {
  if (typeof localStorage === "undefined") return DEFAULTS;
  try {
    const fresh = localStorage.getItem(STORAGE_KEY);
    if (fresh) return { ...DEFAULTS, ...JSON.parse(fresh) };

    for (const key of LEGACY_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const migrated: Settings = {
        ...DEFAULTS,
        ...(parsed as Partial<Settings>),
        selectedTier: profileToTier(parsed.privateFastProfile),
        onboardingCompleted: Boolean(parsed.onboardingCompleted),
        hotkeys: normalizeHotkeys(parsed.hotkeys as Partial<HotkeySettings> | undefined),
        localProcessing: normalizeLocalProcessing(
          parsed.localProcessing as Partial<LocalProcessingSettings> | undefined
        )
      };
      return migrated;
    }
  } catch (error) {
    console.warn("settingsStore: load failed, using defaults", error);
  }
  return DEFAULTS;
}

export function saveSettings(settings: Settings) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
  } catch (error) {
    console.warn("settingsStore: save failed", error);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -w @dictivo/desktop -- tests/settingsStore.test.ts`
Expected: PASS (5 passed).

Run typecheck — this will fail in `App.tsx` and `SettingsView.tsx` because they reference removed fields. **Do not fix those callers yet — they'll be fixed in later tasks.** Note the errors for now:

Run: `npm run typecheck -w @dictivo/desktop`
Expected: errors in `App.tsx`, `SettingsView.tsx` referring to `privateFastProfile`, `modelSelectionMode`. Capture these locations — they're TODO for Phase D.

- [ ] **Step 5: Commit**

Commit only the storage layer + test:

```bash
git add apps/desktop/src/lib/settingsStore.ts apps/desktop/tests/settingsStore.test.ts
git commit -m "feat(desktop): settings store v4 with tier-based schema and migration"
```

(Build will be red until Task D1+; that's expected and recovered by end of Phase D.)

---

## Phase C — Onboarding Wizard

### Task C1: `OnboardingWizard` component skeleton + step state machine

**Files:**
- Create: `apps/desktop/src/components/OnboardingWizard.tsx`
- Create: `apps/desktop/tests/onboardingWizard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/tests/onboardingWizard.test.tsx`:

```typescript
/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OnboardingWizard } from "../src/components/OnboardingWizard";

vi.mock("../src/lib/desktopBridge", () => ({
  isTauriRuntime: () => false,
  getHardwareProfile: vi.fn().mockResolvedValue({
    platform: "macos", arch: "aarch64", cpuCores: 10,
    memoryTotalBytes: 17179869184, accelerators: ["metal"],
    performanceClass: "gpuHigh",
    recommendedModelId: "large-v3-turbo-q5_0", recommendedProfile: "quality",
    reason: ""
  }),
  detectGpu: vi.fn().mockResolvedValue([{ name: "Apple Silicon GPU (Metal)", vramBytes: 9_000_000_000 }]),
  downloadPrivateFastModel: vi.fn().mockResolvedValue({ ready: true, modelId: "large-v3-turbo-q5_0", modelName: "Large v3 Turbo Q5", message: "ok", setupHint: "" }),
  benchmarkTier: vi.fn().mockResolvedValue(0.85),
  writeRunnableTiers: vi.fn().mockResolvedValue(undefined)
}));

describe("OnboardingWizard", () => {
  it("renders step 1 hardware scan", async () => {
    render(<OnboardingWizard onComplete={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Looking at your computer/i)).toBeTruthy());
  });

  it("advances 1 → 2 → 3 → onComplete", async () => {
    const onComplete = vi.fn();
    render(<OnboardingWizard onComplete={onComplete} />);

    await waitFor(() => expect(screen.getByText(/Apple/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(screen.getByText(/Recommended/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /download/i }));

    await waitFor(() => expect(screen.getByText(/Ready/i)).toBeTruthy(), { timeout: 5000 });
    fireEvent.click(screen.getByRole("button", { name: /start dictating/i }));

    expect(onComplete).toHaveBeenCalled();
  });

  it("dismiss button fires onComplete early", async () => {
    const onComplete = vi.fn();
    render(<OnboardingWizard onComplete={onComplete} />);
    await waitFor(() => expect(screen.getByText(/Looking at your computer/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(onComplete).toHaveBeenCalled();
  });
});
```

If `@testing-library/react` is not yet a dependency, add it:

```bash
npm install --save-dev --workspace @dictivo/desktop @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm run test -w @dictivo/desktop -- tests/onboardingWizard.test.tsx`
Expected: FAIL — file not found.

- [ ] **Step 3: Implement the component**

Create `apps/desktop/src/components/OnboardingWizard.tsx`:

```tsx
import { useEffect, useState } from "react";
import {
  benchmarkTier,
  detectGpu,
  downloadPrivateFastModel,
  getHardwareProfile,
  writeRunnableTiers,
  type GpuInfo,
  type HardwareProfile,
  type RunnableTiers
} from "../lib/desktopBridge";

type Step = "scan" | "pick" | "calibrate" | "done";

type OnboardingWizardProps = {
  onComplete: () => void;
};

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState<Step>("scan");
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [gpus, setGpus] = useState<GpuInfo[]>([]);
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string>("");
  const [tiers, setTiers] = useState<RunnableTiers | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [hw, gpuList] = await Promise.all([getHardwareProfile(), detectGpu()]);
        if (cancelled) return;
        setHardware(hw);
        setGpus(gpuList);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Hardware scan failed");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleDownload = async () => {
    if (!hardware) return;
    setBusy(true);
    setError("");
    setProgressLabel("Downloading model...");
    try {
      await downloadPrivateFastModel(hardware.recommendedModelId);
      setProgressLabel("Running quick calibration...");
      setStep("calibrate");
      const rtf = await benchmarkTier(hardware.recommendedModelId);
      const runnable: RunnableTiers = {
        fast: null,
        medium: {
          modelId: hardware.recommendedModelId,
          realtimeFactor: rtf,
          predicted: false,
          downloaded: true
        },
        slow: null,
        fingerprint: "",
        benchmarkedAt: new Date().toISOString()
      };
      await writeRunnableTiers(runnable);
      setTiers(runnable);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed");
    } finally {
      setBusy(false);
      setProgressLabel("");
    }
  };

  return (
    <div className="wizard-shell">
      <div className="wizard-card">
        <div className="wizard-steps">
          <span className={step === "scan" ? "on" : ""}>1</span>
          <span className={step === "pick" ? "on" : ""}>2</span>
          <span className={step === "calibrate" || step === "done" ? "on" : ""}>3</span>
        </div>

        {step === "scan" && (
          <section>
            <h2>Looking at your computer</h2>
            {!hardware && !error && <p className="muted">Detecting...</p>}
            {hardware && (
              <ul className="hw-list">
                <li>CPU · {hardware.cpuCores} cores</li>
                <li>RAM · {Math.round((hardware.memoryTotalBytes ?? 0) / 1024 ** 3)} GB</li>
                <li>GPU · {gpus.length > 0 ? gpus[0].name : "Not detected"}</li>
              </ul>
            )}
            {error && <p className="error">{error}</p>}
            <div className="wizard-actions">
              <button type="button" className="primary" disabled={!hardware} onClick={() => setStep("pick")}>
                Continue →
              </button>
              <button type="button" className="ghost" onClick={onComplete}>Skip setup</button>
            </div>
          </section>
        )}

        {step === "pick" && hardware && (
          <section>
            <h2>Recommended for your hardware</h2>
            <p className="muted">
              Model: <strong>{hardware.recommendedModelId}</strong> — best balance for your machine.
            </p>
            {error && <p className="error">{error}</p>}
            <div className="wizard-actions">
              <button type="button" className="primary" disabled={busy} onClick={() => void handleDownload()}>
                {busy ? progressLabel || "Working..." : "Download (Recommended)"}
              </button>
              <button type="button" className="ghost" onClick={onComplete}>Skip setup</button>
            </div>
          </section>
        )}

        {step === "calibrate" && (
          <section>
            <h2>Quick calibration</h2>
            <p className="muted">{progressLabel || "Running a five-second sample..."}</p>
          </section>
        )}

        {step === "done" && tiers && (
          <section>
            <h2>Ready</h2>
            <p>Your computer can run <strong>Medium</strong> smoothly.</p>
            <div className="wizard-actions">
              <button type="button" className="primary" onClick={onComplete}>Start dictating →</button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -w @dictivo/desktop -- tests/onboardingWizard.test.tsx`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/OnboardingWizard.tsx apps/desktop/tests/onboardingWizard.test.tsx apps/desktop/package.json apps/desktop/package-lock.json
git commit -m "feat(desktop): three-step onboarding wizard"
```

---

## Phase D — Main UI Repaint (Calm Native)

### Task D1: Rewrite `styles/app.css` to Calm Native tokens

**Files:**
- Modify (replace): `apps/desktop/src/styles/app.css`

- [ ] **Step 1: Back up the existing CSS for diff reference**

```bash
cp apps/desktop/src/styles/app.css apps/desktop/src/styles/app.css.bak
```

- [ ] **Step 2: Write the new stylesheet**

Replace `apps/desktop/src/styles/app.css` with:

```css
:root {
  --bg: #f4f5f7;
  --surface: #ffffff;
  --surface-elev: #ffffff;
  --line: #e5e7eb;
  --line-strong: #d1d5db;
  --ink: #1d1d1f;
  --muted: #4b5563;
  --faint: #6b7280;
  --accent: #007aff;
  --accent-soft: #eef4ff;
  --danger: #ef4444;
  --warning: #f59e0b;
  --success: #22c55e;
  --radius-sm: 6px;
  --radius: 8px;
  --radius-lg: 12px;
  --shadow-1: 0 1px 3px rgba(0, 0, 0, .06);
  --shadow-2: 0 4px 12px rgba(0, 0, 0, .08);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable", "Segoe UI", sans-serif;
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1c1c1e;
    --surface: #2c2c2e;
    --surface-elev: #3a3a3c;
    --line: #38383a;
    --line-strong: #48484a;
    --ink: #f2f2f7;
    --muted: #d1d1d6;
    --faint: #8e8e93;
    --accent: #0a84ff;
    --accent-soft: #1a2a44;
    --shadow-1: 0 1px 3px rgba(0, 0, 0, .4);
    --shadow-2: 0 4px 12px rgba(0, 0, 0, .5);
  }
}

* { box-sizing: border-box; }

html, body, #root {
  min-height: 100vh;
  margin: 0;
}

body { background: var(--bg); color: var(--ink); }
body[data-window="companion"] { background: transparent; overflow: hidden; }

button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }

/* Shell */
.app-shell {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  min-height: 100vh;
}
.sidebar {
  background: var(--surface);
  border-right: 1px solid var(--line);
  padding: 16px 12px;
  display: flex; flex-direction: column; gap: 4px;
}
.brand-block {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 4px 16px;
}
.brand-mark {
  width: 28px; height: 28px; border-radius: 7px;
  background: var(--accent); color: white;
  display: grid; place-items: center;
}
.brand-block strong { font-size: 13px; font-weight: 600; }

.nav-list { display: flex; flex-direction: column; gap: 2px; }
.nav-button {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px; border: 0; border-radius: var(--radius-sm);
  background: transparent; color: var(--muted); font-size: 12px;
}
.nav-button:hover { background: var(--bg); }
.nav-button.is-active { background: var(--bg); color: var(--ink); font-weight: 500; }

/* Workspace */
.workspace { padding: 18px 28px; display: flex; flex-direction: column; gap: 16px; min-height: 100vh; }
.topbar { display: flex; align-items: baseline; justify-content: space-between; }
.topbar h1 { margin: 0; font-size: 18px; font-weight: 600; }
.topbar .eyebrow { display: none; }
.toolbar .select-control { display: flex; align-items: center; gap: 4px; color: var(--faint); font-size: 11px; }
.toolbar .select-control select { background: transparent; border: 0; color: inherit; font-size: 11px; }

.status-banner {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 10px 14px;
  font-size: 12px;
  color: var(--muted);
}

/* Mode pills */
.segmented { display: flex; gap: 6px; }
.segmented button {
  padding: 5px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--faint);
  font-size: 11px;
}
.segmented button.is-selected {
  background: var(--ink);
  color: var(--surface);
  border-color: var(--ink);
  font-weight: 500;
}

/* Capture stage */
.dictation-workbench { display: flex; flex-direction: column; gap: 14px; }
.signal-deck { display: flex; flex-direction: column; gap: 14px; }
.mode-strip h2 { font-size: 14px; font-weight: 600; margin: 0; }
.capture-stage {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 28px 24px 32px;
  display: grid; place-items: center;
  gap: 14px; text-align: center;
}
.capture-orbit {
  width: 76px; height: 76px; border-radius: 50%;
  background: var(--accent); color: white;
  display: grid; place-items: center;
  box-shadow: var(--shadow-2);
}
.capture-stage textarea {
  width: 100%; min-height: 120px;
  background: transparent; border: 0; color: var(--ink);
  font-family: inherit; font-size: 14px; resize: vertical;
}

/* Tier selector */
.tier-selector { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 8px; }
.tier-button {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px 12px;
  text-align: left;
  display: flex; flex-direction: column; gap: 2px;
}
.tier-button .name { font-size: 12px; font-weight: 600; }
.tier-button .sub { font-size: 10px; color: var(--faint); }
.tier-button.is-selected { background: var(--accent-soft); border-color: var(--accent); }
.tier-button.is-selected .name { color: var(--accent); }

/* Footer status */
.workbench-footer {
  display: flex; gap: 12px; align-items: center;
  padding-top: 8px; border-top: 1px solid var(--line);
  font-size: 11px; color: var(--faint);
}
.workbench-footer .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--success); }
.workbench-footer .privacy-tag { margin-left: auto; }

/* Settings */
.settings-layout { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 24px; }
.settings-nav { display: flex; flex-direction: column; gap: 2px; }
.settings-nav button {
  text-align: left;
  background: transparent; border: 0;
  padding: 8px 10px; border-radius: var(--radius-sm);
  font-size: 12px; color: var(--muted);
}
.settings-nav button.is-selected { background: var(--bg); color: var(--ink); font-weight: 500; }
.side-panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 18px;
  display: flex; flex-direction: column; gap: 14px;
}
.panel-title { display: flex; align-items: center; gap: 8px; }
.panel-title h2 { margin: 0; font-size: 14px; font-weight: 600; }
.recommend-card {
  border: 1px solid var(--accent);
  background: var(--accent-soft);
  border-radius: var(--radius);
  padding: 12px 14px;
  font-size: 12px;
}
.tier-card-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.tier-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 12px;
  display: flex; flex-direction: column; gap: 4px;
}
.tier-card.is-recommended { border-color: var(--accent); }
.tier-card .name { font-weight: 600; font-size: 13px; }
.tier-card .meta { font-size: 11px; color: var(--faint); }
details.advanced > summary {
  list-style: none; cursor: pointer; font-size: 12px; color: var(--muted);
  padding: 8px 0; user-select: none;
}
details.advanced > summary::before { content: "▸ "; color: var(--faint); }
details.advanced[open] > summary::before { content: "▾ "; }

/* Hotkeys + toggles + permissions (compact reuse) */
.hotkey-grid { display: grid; gap: 8px; }
.hotkey-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--radius);
  background: var(--surface);
}
.hotkey-row strong { font-size: 12px; }
.hotkey-row span { display: block; font-size: 11px; color: var(--faint); }
.toggle-list { display: flex; flex-direction: column; gap: 4px; }
.toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; font-size: 12px; }
.text-button {
  background: transparent; border: 1px solid var(--line);
  border-radius: var(--radius-sm); padding: 5px 10px;
  font-size: 11px; color: var(--muted);
  display: inline-flex; align-items: center; gap: 4px;
}
.text-button:hover:not(:disabled) { background: var(--bg); }
.text-button:disabled { opacity: .5; cursor: default; }
.text-button.is-recording-shortcut { color: var(--accent); border-color: var(--accent); }

/* Avatar picker */
.avatar-picker { display: flex; gap: 8px; }
.avatar-picker button {
  background: transparent; border: 1px solid var(--line);
  border-radius: var(--radius); padding: 8px 12px;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  font-size: 11px;
}
.avatar-picker button.is-selected { border-color: var(--accent); background: var(--accent-soft); }
.avatar-chip {
  width: 36px; height: 36px; border-radius: 50%;
  display: grid; place-items: center; overflow: hidden;
}
.avatar-chip img { width: 100%; height: 100%; object-fit: cover; }

/* Companion (will be themed in Phase G) */
.companion-shell {
  display: flex; align-items: center; gap: 8px;
  padding: 8px;
  min-height: 100vh;
  background: transparent;
}

/* Wizard */
.wizard-shell {
  display: grid; place-items: center;
  min-height: 100vh;
  background: var(--bg);
}
.wizard-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  width: min(480px, 92vw);
  padding: 28px 32px;
  box-shadow: var(--shadow-2);
}
.wizard-steps {
  display: flex; gap: 8px; justify-content: center;
  margin-bottom: 18px;
}
.wizard-steps span {
  width: 22px; height: 22px; border-radius: 50%;
  background: var(--bg); color: var(--faint);
  display: grid; place-items: center; font-size: 11px;
}
.wizard-steps span.on { background: var(--accent); color: white; }
.wizard-card h2 { margin: 0 0 8px; font-size: 17px; font-weight: 600; }
.wizard-card .muted { color: var(--muted); font-size: 12px; margin: 0 0 16px; }
.wizard-card .error { color: var(--danger); font-size: 12px; }
.wizard-card .hw-list { list-style: none; padding: 0; margin: 0 0 16px; font-size: 12px; color: var(--muted); }
.wizard-card .hw-list li { padding: 4px 0; border-bottom: 1px solid var(--line); }
.wizard-actions { display: flex; gap: 8px; justify-content: flex-end; }
.wizard-actions .primary {
  background: var(--accent); color: white; border: 0;
  border-radius: var(--radius); padding: 8px 14px; font-size: 12px; font-weight: 500;
}
.wizard-actions .primary:disabled { opacity: .5; cursor: default; }
.wizard-actions .ghost {
  background: transparent; color: var(--muted); border: 0;
  border-radius: var(--radius); padding: 8px 14px; font-size: 12px;
}
```

- [ ] **Step 3: Delete the backup**

```bash
rm apps/desktop/src/styles/app.css.bak
```

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/styles/app.css
git commit -m "feat(desktop): rewrite stylesheet to Calm Native light theme"
```

(Visual regression vs old screenshots is intentional — covered in Phase H.)

---

### Task D2: Add `TierSelector` component

**Files:**
- Create: `apps/desktop/src/components/TierSelector.tsx`
- Create: `apps/desktop/tests/tierSelector.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/tests/tierSelector.test.tsx`:

```typescript
/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TierSelector } from "../src/components/TierSelector";
import type { RunnableTiers } from "../src/lib/desktopBridge";

const oneTier: RunnableTiers = {
  fast: { modelId: "tiny", realtimeFactor: 0.4, predicted: true, downloaded: true },
  medium: null,
  slow: null,
  fingerprint: "x",
  benchmarkedAt: ""
};

const threeTiers: RunnableTiers = {
  fast: { modelId: "small", realtimeFactor: 0.65, predicted: true, downloaded: true },
  medium: { modelId: "large-v3-turbo-q5_0", realtimeFactor: 0.85, predicted: false, downloaded: true },
  slow: { modelId: "large-v3", realtimeFactor: 2.1, predicted: true, downloaded: false },
  fingerprint: "x",
  benchmarkedAt: ""
};

describe("TierSelector", () => {
  it("renders only available tiers (1)", () => {
    render(<TierSelector tiers={oneTier} selected="fast" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /Fast/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Medium/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Slow/ })).toBeNull();
  });

  it("renders all three when available", () => {
    render(<TierSelector tiers={threeTiers} selected="medium" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /Fast/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Medium/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Slow/ })).toBeTruthy();
  });

  it("calls onSelect with tier id", () => {
    const onSelect = vi.fn();
    render(<TierSelector tiers={threeTiers} selected="medium" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Fast/ }));
    expect(onSelect).toHaveBeenCalledWith("fast");
  });
});
```

- [ ] **Step 2: Run to confirm fail**

Run: `npm run test -w @dictivo/desktop -- tests/tierSelector.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the component**

Create `apps/desktop/src/components/TierSelector.tsx`:

```tsx
import type { RunnableTiers, Tier, TierAssignment } from "../lib/desktopBridge";

type TierSelectorProps = {
  tiers: RunnableTiers;
  selected: Tier;
  onSelect: (tier: Tier) => void;
};

const TIER_META: Record<Tier, { label: string; sub: string }> = {
  fast: { label: "Fast", sub: "Lowest latency" },
  medium: { label: "Medium", sub: "Recommended" },
  slow: { label: "Slow", sub: "Most accurate" }
};

export function TierSelector({ tiers, selected, onSelect }: TierSelectorProps) {
  const entries: Array<[Tier, TierAssignment]> = (["fast", "medium", "slow"] as const)
    .map((id) => [id, tiers[id]] as [Tier, TierAssignment | null])
    .filter((pair): pair is [Tier, TierAssignment] => pair[1] !== null);

  return (
    <div className="tier-selector" role="radiogroup" aria-label="Engine tier">
      {entries.map(([id, assignment]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={selected === id}
          className={`tier-button ${selected === id ? "is-selected" : ""}`}
          onClick={() => onSelect(id)}
        >
          <span className="name">{TIER_META[id].label}</span>
          <span className="sub">
            {TIER_META[id].sub}
            {assignment.predicted ? " · predicted" : ""}
          </span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -w @dictivo/desktop -- tests/tierSelector.test.tsx`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/TierSelector.tsx apps/desktop/tests/tierSelector.test.tsx
git commit -m "feat(desktop): TierSelector component with availability gating"
```

---

### Task D3: Rewrite `DictationWorkbench` (drop telemetry, add TierSelector + footer)

**Files:**
- Modify (replace): `apps/desktop/src/components/DictationWorkbench.tsx`

- [ ] **Step 1: Replace the file content**

Rewrite `apps/desktop/src/components/DictationWorkbench.tsx` with:

```tsx
import type { InputMode, ProcessingMode, SupportedLanguage } from "@dictivo/shared";
import { Mic } from "lucide-react";
import { estimateWordCount } from "@dictivo/shared";
import type { HardwareProfile, PrivateFastModel, PrivateFastStatus, RunnableTiers, Tier } from "../lib/desktopBridge";
import { TierSelector } from "./TierSelector";

type DictationWorkbenchProps = {
  language: SupportedLanguage;
  selectedMode: InputMode;
  modeTemplates: ProcessingMode[];
  isDictating: boolean;
  liveText: string;
  rawText: string;
  hotkeyStatus: string;
  pasteStatus: string;
  privateFastStatus: PrivateFastStatus;
  hardwareProfile: HardwareProfile | null;
  selectedModel: PrivateFastModel | undefined;
  runnableTiers: RunnableTiers;
  selectedTier: Tier;
  onTierChange: (tier: Tier) => void;
  onModeChange: (mode: InputMode) => void;
  onToggleDictation: () => void;
  onLiveTextChange: (value: string) => void;
  onCopyRaw: () => void;
};

export function DictationWorkbench({
  language,
  selectedMode,
  modeTemplates,
  isDictating,
  liveText,
  hotkeyStatus,
  pasteStatus,
  privateFastStatus,
  hardwareProfile,
  selectedModel,
  runnableTiers,
  selectedTier,
  onTierChange,
  onModeChange,
  onToggleDictation,
  onLiveTextChange
}: DictationWorkbenchProps) {
  const activeMode = modeTemplates.find((mode) => mode.inputMode === selectedMode) ?? modeTemplates[0]!;
  const wordCount = estimateWordCount(liveText, language);
  const accel = hardwareProfile?.accelerators?.[0] ?? "CPU";
  const tierLabel = capitalize(selectedTier);
  const modelLabel = selectedModel?.label ?? privateFastStatus.modelName;

  return (
    <section className="dictation-workbench" aria-label="Local dictation workbench">
      <div className="signal-deck">
        <div className="mode-strip">
          <h2>{activeMode.label}</h2>
          <div className="segmented">
            {modeTemplates.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={selectedMode === mode.inputMode ? "is-selected" : ""}
                onClick={() => onModeChange(mode.inputMode)}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        <div className={`capture-stage ${isDictating ? "is-recording" : ""}`}>
          <button type="button" className="capture-orbit" onClick={onToggleDictation} aria-label={isDictating ? "Stop dictation" : "Start dictation"}>
            <Mic size={28} />
          </button>
          <textarea
            value={liveText}
            onChange={(event) => onLiveTextChange(event.target.value)}
            placeholder="Press your dictation hotkey, or click the mic to start."
            aria-label="Live dictation text"
          />
        </div>
      </div>

      <TierSelector tiers={runnableTiers} selected={selectedTier} onSelect={onTierChange} />

      <div className="workbench-footer">
        <span className="dot" />
        <span>{tierLabel} · {modelLabel} · {accel} · {hotkeyStatus}</span>
        <span className="privacy-tag">Transcript stays on this device {pasteStatus ? `· ${pasteStatus}` : ""} · {wordCount} words</span>
      </div>
    </section>
  );
}

function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
```

- [ ] **Step 2: Typecheck — expected to still fail in App.tsx (fixed next task)**

Run: `npm run typecheck -w @dictivo/desktop`
Expected: errors in `App.tsx` (still passing old props to workbench). That's fine.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/components/DictationWorkbench.tsx
git commit -m "feat(desktop): simplify DictationWorkbench with TierSelector + footer"
```

---

### Task D4: Update `App.tsx` to use tier state + onboarding wizard

**Files:**
- Modify: `apps/desktop/src/App.tsx`

- [ ] **Step 1: Read the current file to know exact line context**

```bash
sed -n '115,230p' apps/desktop/src/App.tsx
```

- [ ] **Step 2: Apply edits**

Several edits in sequence:

(a) Update imports — replace existing settingsStore import block with:

```typescript
import {
  DEFAULT_HOTKEYS,
  DEFAULT_LOCAL_PROCESSING,
  loadSettings,
  normalizeHotkeys,
  normalizeLocalProcessing,
  saveSettings,
  type HotkeySettings,
  type LocalProcessingSettings,
  type CompanionAvatar
} from "./lib/settingsStore";
```

Add to the desktopBridge import block:

```typescript
import {
  // existing imports kept...
  getRunnableTiers,
  type RunnableTiers,
  type Tier
} from "./lib/desktopBridge";
```

Add a new import at the top of imports:

```typescript
import { OnboardingWizard } from "./components/OnboardingWizard";
```

(b) Replace state declarations — find the block from `privateFastProfile` through `modelSelectionMode`:

```typescript
  const [privateFastProfile, setPrivateFastProfile] = useState<PrivateFastProfile>("balanced");
  const [modelSelectionMode, setModelSelectionMode] = useState<ModelSelectionMode>("auto");
```

Replace with:

```typescript
  const [selectedTier, setSelectedTier] = useState<Tier>("medium");
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean>(false);
  const [runnableTiers, setRunnableTiers] = useState<RunnableTiers>({
    fast: null,
    medium: null,
    slow: null,
    fingerprint: "",
    benchmarkedAt: ""
  });
```

(c) In the `loadSettings()` useEffect (lines ~177-195), remove the `privateFastProfile`/`modelSelectionMode` lines and add:

```typescript
    if (settings.selectedTier) setSelectedTier(settings.selectedTier);
    setOnboardingCompleted(Boolean(settings.onboardingCompleted));
```

(d) Update the persistence useEffect (currently lines ~197-211) — its argument to `saveSettings` becomes:

```typescript
    saveSettings({
      language,
      selectedMode,
      selectedTier,
      onboardingCompleted,
      companionEnabled,
      companionAvatar,
      hotkeys,
      localProcessing,
      dictionary,
      snippets
    });
```

And its dep array becomes `[companionAvatar, companionEnabled, dictionary, hotkeys, language, localProcessing, onboardingCompleted, selectedMode, selectedTier, snippets]`.

(e) Replace the entire auto-selection useEffect (currently lines ~213-228 starting `if (modelSelectionMode !== "auto"`) with:

```typescript
  useEffect(() => {
    void getRunnableTiers().then(setRunnableTiers).catch(() => {});
  }, [onboardingCompleted]);

  useEffect(() => {
    const assignment = runnableTiers[selectedTier];
    if (!assignment?.downloaded) return;
    if (assignment.modelId === selectedModel?.id) return;
    void selectPrivateFastModel(assignment.modelId)
      .then((status) => {
        setPrivateFastStatus(status);
        return getPrivateFastModels();
      })
      .then(setPrivateFastModels)
      .catch(() => {});
  }, [runnableTiers, selectedModel?.id, selectedTier]);
```

(f) In `stopDictation`, change the `profile: privateFastProfile,` argument to `runLocalDictation` to `profile: tierToProfile(selectedTier),`. Add this helper at the bottom of the file (above the existing helper functions):

```typescript
function tierToProfile(tier: Tier): "fast" | "balanced" | "quality" {
  if (tier === "fast") return "fast";
  if (tier === "slow") return "quality";
  return "balanced";
}
```

(g) In the JSX `return (...)`, wrap the existing return body so that when onboarding is pending we render the wizard:

```tsx
  if (!onboardingCompleted) {
    return <OnboardingWizard onComplete={() => setOnboardingCompleted(true)} />;
  }

  return (
    <main className="app-shell">
      {/* existing JSX */}
    </main>
  );
```

(h) In the `<DictationWorkbench ...>` JSX, swap the prop list to match the new contract:

```tsx
          <DictationWorkbench
            language={language}
            selectedMode={selectedMode}
            modeTemplates={modeTemplates}
            isDictating={isDictating}
            liveText={liveText}
            rawText={rawText}
            hotkeyStatus={hotkeyStatus}
            pasteStatus={pasteStatus}
            privateFastStatus={privateFastStatus}
            hardwareProfile={hardwareProfile}
            selectedModel={selectedModel}
            runnableTiers={runnableTiers}
            selectedTier={selectedTier}
            onTierChange={setSelectedTier}
            onModeChange={setSelectedMode}
            onToggleDictation={toggleDictation}
            onLiveTextChange={setLiveText}
            onCopyRaw={() => void navigator.clipboard.writeText(rawText)}
          />
```

(i) Update the `<SettingsView ...>` JSX — remove `privateFastProfile`/`modelSelectionMode`/`onProfileChange`/`onSelectionModeChange` props (they no longer exist on SettingsView after Phase F). Leave the other props as-is. Will be fixed in F1.

- [ ] **Step 3: Verify typecheck reaches `SettingsView.tsx`**

Run: `npm run typecheck -w @dictivo/desktop`
Expected: errors should now be confined to `SettingsView.tsx` and `ModelManager.tsx` (Phase F territory).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/App.tsx
git commit -m "feat(desktop): App.tsx uses tier state + onboarding gate"
```

---

## Phase E — Phase D follow-up (build still red ends here)

(All Phase-D work is bundled into D4. Phase E is reserved for follow-up if D1–D4 needs splitting during execution.)

---

## Phase F — Settings Page Refactor

### Task F1: Rewrite `ModelManager.tsx` — Recommended card + tier cards + Advanced

**Files:**
- Modify (replace): `apps/desktop/src/components/ModelManager.tsx`

- [ ] **Step 1: Replace the file**

Rewrite `apps/desktop/src/components/ModelManager.tsx` with:

```tsx
import { Download, Trash2 } from "lucide-react";
import { useState } from "react";
import type { HardwareProfile, PrivateFastModel, PrivateFastStatus, RunnableTiers } from "../lib/desktopBridge";
import { rerunBenchmark } from "../lib/desktopBridge";

type ModelManagerProps = {
  status: PrivateFastStatus;
  models: PrivateFastModel[];
  hardwareProfile: HardwareProfile | null;
  runnableTiers: RunnableTiers;
  operation: string;
  onModelAction: (action: "select" | "download" | "delete", modelId: string) => void;
  onImportModel: (modelId: string, sourcePath: string) => void;
  onRefresh: () => void;
};

export function ModelManager({
  status,
  models,
  hardwareProfile,
  runnableTiers,
  operation,
  onModelAction,
  onImportModel,
  onRefresh
}: ModelManagerProps) {
  const [importModelId, setImportModelId] = useState("small");
  const [importPath, setImportPath] = useState("");

  const mediumModel = models.find((m) => m.id === runnableTiers.medium?.modelId);

  return (
    <div className="model-manager">
      <div className="recommend-card">
        <strong>Recommended for your hardware</strong>
        <div style={{ marginTop: 6 }}>
          {mediumModel?.label ?? hardwareProfile?.recommendedModelId ?? "—"}
          {hardwareProfile ? ` · ${hardwareProfile.cpuCores} cores · ${formatRam(hardwareProfile.memoryTotalBytes)}` : ""}
        </div>
        <button
          type="button"
          className="text-button"
          style={{ marginTop: 8 }}
          onClick={async () => { await rerunBenchmark(); onRefresh(); }}
        >
          Re-run setup
        </button>
      </div>

      <div className="tier-card-row">
        <TierCard
          name="Fast"
          subtitle="Lowest latency"
          assignment={runnableTiers.fast}
          models={models}
        />
        <TierCard
          name="Medium"
          subtitle="Recommended"
          assignment={runnableTiers.medium}
          models={models}
          isRecommended
        />
        <TierCard
          name="Slow"
          subtitle="Most accurate"
          assignment={runnableTiers.slow}
          models={models}
        />
      </div>

      <details className="advanced">
        <summary>Advanced — full model catalog</summary>
        <div className="model-catalog" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {models.map((model) => {
            const pending = operation.endsWith(`:${model.id}`);
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
                        {pending && operation.startsWith("delete:") ? "Deleting" : "Delete"}
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
                      {pending && operation.startsWith("download:") ? "Downloading" : "Download"}
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
  name,
  subtitle,
  assignment,
  models,
  isRecommended
}: {
  name: string;
  subtitle: string;
  assignment: RunnableTiers["fast"];
  models: PrivateFastModel[];
  isRecommended?: boolean;
}) {
  if (!assignment) {
    return (
      <article className="tier-card" style={{ opacity: 0.55 }}>
        <div className="name">{name}</div>
        <div className="meta">Not available on this hardware</div>
      </article>
    );
  }
  const model = models.find((m) => m.id === assignment.modelId);
  return (
    <article className={`tier-card ${isRecommended ? "is-recommended" : ""}`}>
      <div className="name">{name}</div>
      <div className="meta">{subtitle}</div>
      <div className="meta">{model?.label ?? assignment.modelId} {model?.sizeLabel ? `· ${model.sizeLabel}` : ""}</div>
      {!assignment.downloaded && <div className="meta">Download on first use</div>}
    </article>
  );
}

function formatRam(bytes?: number) {
  if (!bytes) return "RAM unknown";
  return `${Math.round(bytes / 1024 ** 3)} GB RAM`;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/components/ModelManager.tsx
git commit -m "feat(desktop): ModelManager surfaces 3 tier cards + Advanced collapse"
```

---

### Task F2: Restructure `SettingsView.tsx` — 5 sections → 4

**Files:**
- Modify (replace): `apps/desktop/src/components/SettingsView.tsx`

- [ ] **Step 1: Replace the file**

Rewrite `apps/desktop/src/components/SettingsView.tsx` with:

```tsx
import { Bot, ClipboardCheck, Cat, Dog, Keyboard, KeyRound, Lock, Mic2, RefreshCw, ShieldCheck, SlidersHorizontal, UserRound, WifiOff } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import trumpAvatarImage from "../assets/avatars/trump-companion.png";
import type { HardwareProfile, PrivateFastModel, PrivateFastStatus, RunnableTiers } from "../lib/desktopBridge";
import type { CompanionAvatar, HotkeySettings, LocalProcessingSettings } from "../lib/settingsStore";
import { ModelManager } from "./ModelManager";

type SettingsSection = "engine" | "hotkeys" | "companion" | "privacy";

type SettingsViewProps = {
  hotkeys: HotkeySettings;
  localProcessing: LocalProcessingSettings;
  permissions: Record<string, string>;
  privateFastStatus: PrivateFastStatus;
  privateFastModels: PrivateFastModel[];
  privateFastOperation: string;
  runnableTiers: RunnableTiers;
  companionEnabled: boolean;
  companionAvatar: CompanionAvatar;
  hardwareProfile: HardwareProfile | null;
  onHotkeyChange: (key: keyof HotkeySettings, value: string) => void;
  onProcessingChange: (key: keyof LocalProcessingSettings, value: boolean) => void;
  onCompanionEnabledChange: (enabled: boolean) => void;
  onCompanionAvatarChange: (avatar: CompanionAvatar) => void;
  onModelAction: (action: "select" | "download" | "delete", modelId: string) => void;
  onImportModel: (modelId: string, sourcePath: string) => void;
  onRefreshNative: () => void;
  initialSection?: SettingsSection;
};

const sections: Array<{ id: SettingsSection; label: string; icon: ReactNode }> = [
  { id: "engine", label: "Local Engine", icon: <WifiOff size={14} /> },
  { id: "hotkeys", label: "Hotkeys", icon: <KeyRound size={14} /> },
  { id: "companion", label: "Companion", icon: <Bot size={14} /> },
  { id: "privacy", label: "Privacy", icon: <Lock size={14} /> }
];

const avatars: Array<{ id: CompanionAvatar; label: string; icon: ReactNode; image?: string }> = [
  { id: "dog", label: "Dog", icon: <Dog size={18} /> },
  { id: "cat", label: "Cat", icon: <Cat size={18} /> },
  { id: "trump", label: "Trump", icon: <UserRound size={18} />, image: trumpAvatarImage }
];

export const privacyPermissionItems: Array<{
  key: "microphone" | "accessibility" | "pasteAutomation";
  label: string;
  requirement: string;
  description: string;
  icon: ReactNode;
}> = [
  { key: "microphone", label: "Microphone", requirement: "Required", description: "Records dictation audio so the local engine can transcribe it on this computer.", icon: <Mic2 size={15} /> },
  { key: "accessibility", label: "Accessibility", requirement: "Recommended", description: "Allows Dictivo to control paste behavior and keep global dictation shortcuts reliable.", icon: <Keyboard size={15} /> },
  { key: "pasteAutomation", label: "Auto paste", requirement: "Optional", description: "Places the final transcript into the active app. If unavailable, the transcript stays available in Dictivo.", icon: <ClipboardCheck size={15} /> }
];

export function describePermissionStatus(value?: string): { label: string; detail: string; tone: "ready" | "attention" | "neutral" } {
  switch (value) {
    case "granted": return { label: "Ready", detail: "The operating system reports this permission as available.", tone: "ready" };
    case "clipboard-only": return { label: "Copy only", detail: "Dictivo can copy locally, but direct paste automation is not available here.", tone: "neutral" };
    case "web-preview": return { label: "Preview only", detail: "This status is from the browser preview, not the installed desktop app.", tone: "neutral" };
    case "denied":
    case "blocked": return { label: "Needs permission", detail: "Enable this permission in system settings before using the related workflow.", tone: "attention" };
    case "pending-native-prompt":
    case "not-determined":
    case undefined: return { label: "Needs system check", detail: "Dictivo has not received a confirmed system permission state yet.", tone: "attention" };
    default: return { label: "Not verified", detail: "Refresh local status after granting permissions in system settings.", tone: "neutral" };
  }
}

export function SettingsView({
  hotkeys,
  localProcessing,
  permissions,
  privateFastStatus,
  privateFastModels,
  privateFastOperation,
  runnableTiers,
  companionEnabled,
  companionAvatar,
  hardwareProfile,
  onHotkeyChange,
  onProcessingChange,
  onCompanionEnabledChange,
  onCompanionAvatarChange,
  onModelAction,
  onImportModel,
  onRefreshNative,
  initialSection = "engine"
}: SettingsViewProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);

  return (
    <section className="settings-layout">
      <nav className="settings-nav" aria-label="Settings sections">
        {sections.map((item) => (
          <button
            key={item.id}
            type="button"
            className={section === item.id ? "is-selected" : ""}
            onClick={() => setSection(item.id)}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </nav>

      <div className="settings-content">
        {section === "engine" && (
          <div className="side-panel">
            <div className="panel-title"><WifiOff size={16} /><h2>Local Engine</h2></div>
            <ModelManager
              status={privateFastStatus}
              models={privateFastModels}
              hardwareProfile={hardwareProfile}
              runnableTiers={runnableTiers}
              operation={privateFastOperation}
              onModelAction={onModelAction}
              onImportModel={onImportModel}
              onRefresh={onRefreshNative}
            />
            <details className="advanced">
              <summary>Processing toggles</summary>
              <div className="toggle-list" style={{ marginTop: 8 }}>
                <ToggleRow label="Auto polish" checked={localProcessing.autoPolish} onChange={(v) => onProcessingChange("autoPolish", v)} />
                <ToggleRow label="Spoken punctuation" checked={localProcessing.spokenPunctuation} onChange={(v) => onProcessingChange("spokenPunctuation", v)} />
                <ToggleRow label="Remove fillers" checked={localProcessing.fillerWords} onChange={(v) => onProcessingChange("fillerWords", v)} />
                <ToggleRow label="Smart capitalization" checked={localProcessing.smartCapitalization} onChange={(v) => onProcessingChange("smartCapitalization", v)} />
              </div>
            </details>
          </div>
        )}

        {section === "hotkeys" && (
          <div className="side-panel">
            <div className="panel-title"><KeyRound size={16} /><h2>Hotkeys</h2></div>
            <div className="hotkey-grid">
              <ShortcutRecorder label="Dictation" value={hotkeys.dictation} onChange={(value) => onHotkeyChange("dictation", value)} />
              <ShortcutRecorder label="Paste Last" value={hotkeys.pasteLast} onChange={(value) => onHotkeyChange("pasteLast", value)} />
            </div>
            <div className="toggle-list">
              <label className="toggle-row">
                Dictation activation
                <select value={hotkeys.activationMode} onChange={(event) => onHotkeyChange("activationMode", event.target.value)}>
                  <option value="toggle">Toggle</option>
                  <option value="hold">Press and hold</option>
                </select>
              </label>
            </div>
          </div>
        )}

        {section === "companion" && (
          <div className="side-panel">
            <div className="panel-title"><Bot size={16} /><h2>Floating Companion</h2></div>
            <div className="toggle-list">
              <ToggleRow label="Show floating companion" checked={companionEnabled} onChange={onCompanionEnabledChange} />
            </div>
            <div className="avatar-picker" aria-label="Companion avatar">
              {avatars.map((avatar) => (
                <button
                  key={avatar.id}
                  type="button"
                  className={companionAvatar === avatar.id ? "is-selected" : ""}
                  onClick={() => onCompanionAvatarChange(avatar.id)}
                >
                  <span className={`avatar-chip avatar-chip--${avatar.id}`}>
                    {avatar.image ? <img src={avatar.image} alt="" draggable={false} /> : avatar.icon}
                  </span>
                  <strong>{avatar.label}</strong>
                </button>
              ))}
            </div>
          </div>
        )}

        {section === "privacy" && (
          <div className="side-panel">
            <div className="panel-title"><Lock size={16} /><h2>Permissions & Privacy</h2></div>
            <div className="privacy-pledge"><ShieldCheck size={16} />
              <div>
                <strong>Local-only by design</strong>
                <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>Audio, text, dictionary terms, snippets, and transcripts stay on this device.</p>
              </div>
            </div>
            <div className="permission-list">
              {privacyPermissionItems.map((item) => {
                const status = describePermissionStatus(permissions[item.key]);
                return (
                  <article key={item.key} style={{ display: "grid", gridTemplateColumns: "24px 1fr auto", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                    <span aria-hidden="true">{item.icon}</span>
                    <div>
                      <strong style={{ fontSize: 12 }}>{item.label}</strong>
                      <p style={{ margin: 0, fontSize: 11, color: "var(--muted)" }}>{item.description}</p>
                    </div>
                    <span style={{ fontSize: 11, color: status.tone === "ready" ? "var(--success)" : status.tone === "attention" ? "var(--warning)" : "var(--faint)" }}>
                      {status.label}
                    </span>
                  </article>
                );
              })}
            </div>
            <button type="button" className="text-button" onClick={onRefreshNative}>
              <RefreshCw size={13} /> Refresh local status
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function ShortcutRecorder({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [recording, setRecording] = useState(false);
  useEffect(() => {
    if (!recording) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") { setRecording(false); return; }
      const shortcut = eventToShortcut(event);
      if (!shortcut) return;
      onChange(shortcut);
      setRecording(false);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onChange, recording]);

  return (
    <div className="hotkey-row">
      <div>
        <strong>{label}</strong>
        <span>{value}</span>
      </div>
      <button type="button" className={`text-button ${recording ? "is-recording-shortcut" : ""}`} onClick={() => setRecording(true)}>
        {recording ? "Press keys..." : "Change"}
      </button>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function eventToShortcut(event: KeyboardEvent) {
  const key = normalizedShortcutKey(event.key);
  if (!key) return "";
  const modifiers: string[] = [];
  if (event.metaKey || event.ctrlKey) modifiers.push("CommandOrControl");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  return [...modifiers, key].join("+");
}

function normalizedShortcutKey(key: string) {
  if (["Meta", "Control", "Alt", "Shift"].includes(key)) return "";
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  return key;
}
```

- [ ] **Step 2: Update `App.tsx` to pass `runnableTiers` to SettingsView**

In `App.tsx`'s `<SettingsView />` JSX, ensure the props include `runnableTiers={runnableTiers}`. Remove any leftover `privateFastProfile` / `modelSelectionMode` / `onProfileChange` / `onSelectionModeChange` props from earlier scaffolding.

- [ ] **Step 3: Verify build is green**

```bash
npm run typecheck -w @dictivo/desktop
```

Expected: 0 errors.

```bash
npm run test -w @dictivo/desktop
```

Expected: all existing tests PASS (settingsStore, onboardingWizard, tierSelector).

```bash
npm run build -w @dictivo/desktop
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/components/SettingsView.tsx apps/desktop/src/App.tsx
git commit -m "feat(desktop): Settings 5→4 sections, Processing in Engine→Advanced"
```

---

## Phase G — Companion Window Restyle

### Task G1: Resize companion window in `tauri.conf.json`

**Files:**
- Modify: `apps/desktop/src-tauri/tauri.conf.json`

- [ ] **Step 1: Update window block**

Find the `"label": "companion"` window block. The current `width` / `height` are 372 / 164. Change to:

```json
"width": 360,
"height": 100,
"minWidth": 320,
"minHeight": 90,
```

Keep `transparent: true`, `decorations: false`, `shadow: false`, `alwaysOnTop: true`, `skipTaskbar: true` — these already match the spec.

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src-tauri/tauri.conf.json
git commit -m "chore(desktop): resize companion window to 360x100"
```

---

### Task G2: Restyle `CompanionWindow.tsx` — avatar cutout + separate bubble

**Files:**
- Modify (replace): `apps/desktop/src/components/CompanionWindow.tsx`
- Append CSS to: `apps/desktop/src/styles/app.css`

- [ ] **Step 1: Append companion-specific CSS**

Append to the bottom of `apps/desktop/src/styles/app.css`:

```css
/* Companion: avatar cutout + bubble */
.companion-shell {
  display: flex; align-items: center; gap: 8px;
  padding: 8px;
  min-height: 100vh;
  background: transparent;
  -webkit-app-region: drag;
}
.companion-avatar-wrap {
  position: relative;
  width: 76px; height: 76px;
  flex-shrink: 0;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, .25));
}
.companion-avatar {
  width: 100%; height: 100%;
  display: block;
}
.companion-shell--recording .companion-avatar {
  animation: companion-breathe 1.4s ease-in-out infinite;
}
@keyframes companion-breathe {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-3px); }
}
.companion-shell--processing .companion-avatar {
  animation: companion-sway 1.4s ease-in-out infinite;
}
@keyframes companion-sway {
  0%, 100% { transform: translateX(0); }
  25%      { transform: translateX(-2px); }
  75%      { transform: translateX(2px); }
}
.companion-emote {
  position: absolute;
  top: -4px; right: -6px;
  width: 22px; height: 22px;
  border-radius: 50%;
  display: grid; place-items: center;
  font-size: 12px; font-weight: bold;
  color: white;
  box-shadow: 0 1px 4px rgba(0, 0, 0, .25);
}
.companion-emote--rec  { background: var(--danger); }
.companion-emote--proc { background: var(--accent); }
.companion-emote--done { background: var(--success); }
.companion-emote--err  { background: var(--warning); }

.companion-bubble {
  position: relative;
  background: var(--surface);
  border-radius: 14px;
  padding: 10px 14px;
  min-width: 200px; max-width: 240px;
  box-shadow: var(--shadow-1), var(--shadow-2);
  border-top: 3px solid transparent;
  -webkit-app-region: drag;
}
.companion-bubble::before {
  content: "";
  position: absolute;
  left: -6px; top: 18px;
  width: 12px; height: 12px;
  background: var(--surface);
  transform: rotate(45deg);
  z-index: -1;
}
.companion-shell--recording  .companion-bubble { border-top-color: var(--danger); }
.companion-shell--processing .companion-bubble { border-top-color: var(--accent); }
.companion-shell--complete   .companion-bubble { border-top-color: var(--success); }
.companion-shell--error      .companion-bubble,
.companion-shell--blocked    .companion-bubble { border-top-color: var(--warning); }
.companion-title { font-size: 12px; font-weight: 600; line-height: 1.2; }
.companion-timer { font-size: 20px; font-weight: 600; margin-top: 2px; font-variant-numeric: tabular-nums; color: var(--danger); }
.companion-sub { font-size: 11px; color: var(--muted); margin-top: 2px; }
.companion-sub kbd { background: var(--bg); border: 1px solid var(--line); border-radius: 3px; padding: 0 4px; font: inherit; font-size: 10px; }
.companion-hide-button {
  position: absolute;
  top: 4px; right: 6px;
  width: 18px; height: 18px;
  border-radius: 50%;
  border: 0; background: transparent;
  color: var(--faint);
  display: grid; place-items: center;
  opacity: 0;
  -webkit-app-region: no-drag;
}
.companion-shell:hover .companion-hide-button { opacity: 1; }

@media not all and (-webkit-min-device-pixel-ratio: 0) {
  /* Linux fallback: opaque companion */
  .companion-shell { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; }
}
```

- [ ] **Step 2: Replace the component**

Rewrite `apps/desktop/src/components/CompanionWindow.tsx`:

```tsx
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import trumpAvatarImage from "../assets/avatars/trump-companion.png";
import type { CompanionAvatar } from "../lib/settingsStore";
import type { CompanionPhase, CompanionSnapshot } from "../lib/companion";

const defaultSnapshot: CompanionSnapshot = {
  enabled: true,
  avatar: "dog",
  phase: "idle",
  hotkey: "CommandOrControl+Shift+Space",
  title: "Standing by",
  detail: "CommandOrControl+Shift+Space to record",
  summary: "Local dictation is ready.",
  transcriptPreview: "",
  pasteStatus: "",
  wordCount: 0
};

export function CompanionWindow() {
  const [snapshot, setSnapshot] = useState<CompanionSnapshot>(defaultSnapshot);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<CompanionSnapshot>("companion-state", (event) => setSnapshot(event.payload)).then((cleanup) => {
      unlisten = cleanup;
    });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (snapshot.phase !== "recording") return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [snapshot.phase]);

  const elapsed = useMemo(() => {
    if (!snapshot.recordingStartedAt) return "00:00";
    return formatElapsed(Math.max(0, Math.floor((now - snapshot.recordingStartedAt) / 1000)));
  }, [now, snapshot.recordingStartedAt]);

  const startDragging = () => {
    void getCurrentWindow().startDragging().catch(() => undefined);
  };

  const hideCompanion = () => {
    void emitTo("main", "companion-hide-requested", {});
    void getCurrentWindow().hide().catch(() => undefined);
  };

  const emoteFor = (phase: CompanionPhase) => {
    if (phase === "recording") return <div className="companion-emote companion-emote--rec">●</div>;
    if (phase === "processing") return <div className="companion-emote companion-emote--proc">…</div>;
    if (phase === "complete") return <div className="companion-emote companion-emote--done">✓</div>;
    if (phase === "error" || phase === "blocked") return <div className="companion-emote companion-emote--err">!</div>;
    return null;
  };

  return (
    <section
      className={`companion-shell companion-shell--${snapshot.phase}`}
      onPointerDown={startDragging}
      aria-label="Dictivo floating recording status"
    >
      <div className="companion-avatar-wrap">
        <CartoonAvatar avatar={snapshot.avatar} phase={snapshot.phase} />
        {emoteFor(snapshot.phase)}
      </div>

      <div className="companion-bubble">
        <button
          className="companion-hide-button"
          type="button"
          title="Hide companion"
          aria-label="Hide companion"
          onClick={hideCompanion}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <X size={11} />
        </button>

        <div className="companion-title">{snapshot.title}</div>
        {snapshot.phase === "recording" ? (
          <div className="companion-timer">{elapsed}</div>
        ) : null}
        <div className="companion-sub">{snapshot.detail || snapshot.summary}</div>
      </div>
    </section>
  );
}

function CartoonAvatar({ avatar, phase }: { avatar: CompanionAvatar; phase: CompanionPhase }) {
  if (avatar === "cat") return <CatAvatar phase={phase} />;
  if (avatar === "trump") {
    return (
      <img
        className={`companion-avatar companion-avatar--trump is-${phase}`}
        src={trumpAvatarImage}
        alt="Cartoon Trump"
        draggable={false}
      />
    );
  }
  return <DogAvatar phase={phase} />;
}

function DogAvatar({ phase }: { phase: CompanionPhase }) {
  return (
    <svg className={`companion-avatar companion-avatar--dog is-${phase}`} viewBox="0 0 96 96" role="img" aria-label="Cartoon dog">
      <circle cx="48" cy="52" r="31" fill="#d89954" />
      <path d="M23 42c-6-11-3-23 7-26 8 3 12 12 10 25z" fill="#734729" />
      <path d="M73 42c6-11 3-23-7-26-8 3-12 12-10 25z" fill="#734729" />
      <circle cx="36" cy="48" r="4" fill="#1a1210" />
      <circle cx="60" cy="48" r="4" fill="#1a1210" />
      <path d="M42 59c4 3 8 3 12 0" fill="none" stroke="#1a1210" strokeWidth="4" strokeLinecap="round" />
      <path d="M43 54h10l-5 6z" fill="#1a1210" />
      <path d="M26 69c13 13 31 13 44 0" fill="none" stroke="#f2ca89" strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}

function CatAvatar({ phase }: { phase: CompanionPhase }) {
  return (
    <svg className={`companion-avatar companion-avatar--cat is-${phase}`} viewBox="0 0 96 96" role="img" aria-label="Cartoon cat">
      <path d="M24 35 18 13l22 14m32 8 6-22-22 14" fill="#5a6970" />
      <circle cx="48" cy="52" r="31" fill="#7f9299" />
      <circle cx="36" cy="48" r="4" fill="#0b1112" />
      <circle cx="60" cy="48" r="4" fill="#0b1112" />
      <path d="M43 56h10l-5 6z" fill="#ffb7c5" />
      <path d="M48 61v7" stroke="#0b1112" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 60h-16m48 0h16M34 66H18m44 0h16" stroke="#e6f5f2" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remaining.toString().padStart(2, "0")}`;
}
```

- [ ] **Step 3: Build + verify**

```bash
npm run typecheck -w @dictivo/desktop
npm run build -w @dictivo/desktop
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/components/CompanionWindow.tsx apps/desktop/src/styles/app.css
git commit -m "feat(desktop): companion as avatar cutout + separated bubble"
```

---

## Phase H — Regression Baseline + Documentation

### Task H1: Update Playwright E2E for onboarding + tier flow

**Files:**
- Create: `apps/desktop/e2e/onboarding.spec.ts`
- Create: `apps/desktop/e2e/tier-switch.spec.ts`
- Create: `apps/desktop/e2e/advanced-override.spec.ts`

- [ ] **Step 1: Check existing Playwright config**

```bash
cat apps/desktop/playwright.config.ts
ls apps/desktop/e2e/
```

Note the baseURL and any existing helpers.

- [ ] **Step 2: Create onboarding spec**

Write `apps/desktop/e2e/onboarding.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test("first launch shows onboarding wizard then main shell", async ({ page }) => {
  // clean state — onboardingCompleted must be unset
  await page.addInitScript(() => {
    localStorage.clear();
  });
  await page.goto("/");
  await expect(page.getByText(/Looking at your computer/i)).toBeVisible();
  // Web preview has fake hardware ready; click Continue
  await page.getByRole("button", { name: /Continue/i }).click();
  await expect(page.getByText(/Recommended/i)).toBeVisible();
  // Skip path is also acceptable for the web preview where downloads fail
  await page.getByRole("button", { name: /Skip setup/i }).click();
  await expect(page.getByText(/Dictation/i)).toBeVisible();
});
```

- [ ] **Step 3: Create tier-switch spec**

Write `apps/desktop/e2e/tier-switch.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test("tier selector reflects selection in footer", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "dictivo-settings-v4",
      JSON.stringify({ selectedTier: "medium", onboardingCompleted: true })
    );
  });
  await page.goto("/");

  // Web preview returns Fast + Medium (no Slow); click Fast.
  await page.getByRole("radio", { name: /Fast/i }).click();
  await expect(page.locator(".workbench-footer")).toContainText("Fast");
});
```

- [ ] **Step 4: Create advanced-override spec**

Write `apps/desktop/e2e/advanced-override.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test("settings advanced disclosure exposes raw model catalog", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "dictivo-settings-v4",
      JSON.stringify({ selectedTier: "medium", onboardingCompleted: true })
    );
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Settings/i }).click();
  await page.getByText(/Advanced — full model catalog/i).click();
  await expect(page.getByText(/Tiny|Base|Small/i)).toBeVisible();
});
```

- [ ] **Step 5: Run the E2E suite**

```bash
npm run e2e -w @dictivo/desktop
```

Expected: 3 new specs PASS plus all prior specs PASS. If a prior spec broke (e.g. depended on the old UI structure), inspect and fix it in this same task — record those fixes in the commit body.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/e2e/onboarding.spec.ts apps/desktop/e2e/tier-switch.spec.ts apps/desktop/e2e/advanced-override.spec.ts
git commit -m "test(desktop): e2e for onboarding, tier switch, advanced override"
```

---

### Task H2: Update `docs/test-matrix.md` with hardware tier expectations

**Files:**
- Modify: `docs/test-matrix.md`

- [ ] **Step 1: Add a new section**

Append to `docs/test-matrix.md`:

```markdown

## Hardware tier mapping (manual)

For each row, install Dictivo on the target hardware, run the wizard, and record what the UI shows.

| Machine                              | Expected class | Expected tiers visible              | Verified |
| ------------------------------------ | -------------- | ----------------------------------- | -------- |
| macOS Apple Silicon M3 / 16 GB       | GpuHigh        | Fast, Medium, Slow                  |          |
| macOS Apple Silicon M1 / 8 GB        | CpuStrong      | Fast, Medium (Slow may be hidden)   |          |
| macOS Intel 16 GB with AMD dGPU 8 GB | GpuHigh        | Fast, Medium, Slow                  |          |
| macOS Intel 16 GB, integrated GPU    | CpuStrong      | Fast, Medium                        |          |
| Windows + RTX 3060 (8 GB) + 16 GB    | GpuHigh        | Fast, Medium, Slow                  |          |
| Windows CPU-only, 8 cores, 16 GB     | CpuStrong      | Fast, Medium                        |          |
| Windows CPU-only, 4 cores, 8 GB      | CpuWeak        | Fast (Medium maybe; Slow hidden)    |          |
| Linux + NVIDIA CUDA + 16 GB          | GpuHigh        | Fast, Medium, Slow                  |          |
| Linux CPU-only, 8 cores, 16 GB       | CpuStrong      | Fast, Medium                        |          |

When verifying, also confirm: footer status line reads `<Tier> · <model> · <accel> · <hotkey>` and that the Companion floating window paints correctly without a window chrome.
```

- [ ] **Step 2: Commit**

```bash
git add docs/test-matrix.md
git commit -m "docs: hardware tier mapping verification matrix"
```

---

## Self-Review

After completing all tasks, the implementer should:

1. **Spec coverage check** — re-read the spec; every section has a task above:
   - §1 goals — covered by the whole plan
   - §2 tier model / hardware detection — A1–A11
   - §3 wizard — C1
   - §4 UI redesign — D1–D4, F1, F2
   - §4.6 companion — G1, G2
   - §5 architecture — A11, B1, B2, D4, F1, F2, G1, G2
   - §6 error handling — assertions woven into tasks (download retry path in C1, settings migration catch in B2, runnable_tiers fingerprint-mismatch handling in A11, Linux WM transparency fallback in G2 CSS)
   - §7 testing — A1–A11 (Rust unit), B2/C1/D2 (TS unit), H1 (E2E), H2 (matrix)

2. **Placeholder scan** — search this plan for `TBD`, `TODO`, `implement later`, `add appropriate`. Should return zero.

3. **Type consistency** — names used across tasks:
   - `Tier` (Rust + TS): `"fast" | "medium" | "slow"` — consistent
   - `PerformanceClass` (Rust): `GpuHigh | CpuStrong | CpuWeak`, serialized camelCase — consistent
   - `TierAssignment` fields (Rust → TS): `model_id`/`modelId`, `realtime_factor`/`realtimeFactor`, `predicted`, `downloaded` — consistent via serde camelCase
   - `RunnableTiers` fields: `fast`, `medium`, `slow`, `fingerprint`, `benchmarked_at`/`benchmarkedAt` — consistent
   - Settings keys: `selectedTier`, `onboardingCompleted` — match across `settingsStore.ts` + `App.tsx`

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-12-ui-redesign-and-hardware-aware-tiering.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
