# Dictivo Handoff — 2026-05-15

For the engineer (Codex or otherwise) picking this codebase up at v0.2.8. The previous engineer (this Claude session) hit a wall on a specific macOS bug; the rest of the work is well-shaped and ready to continue.

This document is self-contained. Read top to bottom and you have everything you need.

---

## 1. Where we are right now

- **Repo**: `Rswcf/Dictivo` (this repo), marketing site lives separately at `Rswcf/Dictivo-site` (local clone at `/Users/mayijie/Projects/Code/034_Dictivo_Site`).
- **Current shipped version**: **0.2.8** (commit `69b588b`).
- **Installed locally**: `/Applications/Dictivo.app` = 0.2.8.
- **Tests**: 225 frontend (vitest) + 55 Rust (cargo) + 12 e2e (Playwright). All green on main.
- **CI**: `.github/workflows/build-desktop.yml` runs on every push; latest green.
- **Release workflow**: `.github/workflows/release-desktop.yml` tag-driven, dormant until Apple Developer secrets are added.

Architecture: Tauri 2 (Rust + React 19) desktop app. Local Whisper transcription (whisper.cpp via `private_fast.rs`). FSL-1.1-MIT license, source-available, auto-converts to MIT after 2 years per release.

---

## 2. The bug that the previous engineer (me) could not fix

**Symptom**: the floating companion widget (the small avatar window) disappears when the user enters a macOS fullscreen app (Safari / VS Code / etc.). It correctly follows the user across regular Spaces. Voicy and Raycast do this correctly; Dictivo doesn't.

**What's been tried** (all in `apps/desktop/src-tauri/src/companion_macos.rs`):

| Attempt | What it did | Result |
|---|---|---|
| 1. `visibleOnAllWorkspaces: true` in `tauri.conf.json` | Sets `NSWindowCollectionBehaviorCanJoinAllSpaces` only | Companion follows regular Spaces ✓ but disappears in fullscreen ✗ |
| 2. Manually OR `NSWindowCollectionBehaviorFullScreenAuxiliary` (1 << 8 = 256) via objc2 `msg_send!` at setup time | Adds the auxiliary bit to collectionBehavior | Did not change behavior — still vanishes in fullscreen |
| 3. Re-apply the bit from React side via a Tauri command on companion mount (defence in depth) | Covers cases where macOS rebuilds the NSWindow on Stage Manager / fullscreen transitions | Did not change behavior |
| 4. `setLevel: NSStatusWindowLevel (25)` via objc2 — same level Raycast/Maccy/1Password mini use | Raises the window above floating-level (3) where fullscreen apps render | Still vanishes |

The current implementation in `companion_macos.rs::apply_companion_collection_behavior` applies all four layers and `eprintln!`s a diagnostic line. The user never confirmed the diagnostic line via `Console.app`, so we don't know whether the bits actually stuck on the NSWindow.

### Plan C — what to try next

In priority order, three independent paths to escalate:

**C1 — NSPanel styleMask conversion (likely answer).** Tauri creates a regular `NSWindow`; floating widgets that survive fullscreen typically use `NSPanel` semantics. Set the style mask to include `NSWindowStyleMaskNonactivatingPanel` (`1 << 7 = 128`):

```rust
const NS_WINDOW_STYLE_MASK_NONACTIVATING_PANEL: u64 = 1 << 7;
unsafe {
    let current: u64 = msg_send![ns_window, styleMask];
    let _: () = msg_send![ns_window, setStyleMask: current | NS_WINDOW_STYLE_MASK_NONACTIVATING_PANEL];
}
```

This needs the underlying class to actually be `NSPanel`. Tauri may reject this on `NSWindow` instances. If so, you may need to swizzle the window class:

```rust
// Conceptual — would need objc2 class-swizzling support.
let panel_class: &AnyClass = class!(NSPanel);
let _: () = msg_send![ns_window, setClass: panel_class];
```

Class-swizzling at runtime is fragile. The cleaner alternative is option C3 below.

**C2 — Raise to a higher level.** Try `NSPopUpMenuWindowLevel` (101) or `NSScreenSaverWindowLevel` (1000). 1000 will always paint above fullscreen apps but may also paint above macOS system overlays (Volume HUD, brightness, focus). Worth testing as a diagnostic to confirm the OS isn't simply ignoring our level change.

**C3 — Spawn the companion as a dedicated `NSPanel` in Rust, bypassing Tauri's window factory.** Most reliable. Create a borderless transparent `NSPanel` in `lib.rs::run` setup, set the necessary flags directly, and load the React companion view into a `WKWebView` hosted in that panel. Tauri's `WebviewWindow` builder doesn't expose a panel option, but a manual `objc2-app-kit` panel + wry webview is doable.

**C4 — Use the existing tauri-nspanel community plugin.** Search crates.io / GitHub for `tauri-nspanel`. If a maintained plugin exists for Tauri 2, drop it in instead of writing custom Cocoa code.

### How to verify plan C worked

1. Push the change, rebuild locally (`npm run tauri:build -w @dictivo/desktop -- --bundles app --target aarch64-apple-darwin --config '{"bundle":{"createUpdaterArtifacts":false}}'`).
2. Replace `/Applications/Dictivo.app` with the new build.
3. `pkill -f Dictivo && open /Applications/Dictivo.app`.
4. Open Safari. Press the green window button to enter macOS fullscreen.
5. Expected: Dictivo's floating avatar visible over the fullscreen Safari.

Diagnostic logs in `Console.app` under the live device stream, search `companion`:

```
companion NSWindow: behavior before=0x... after=0x...
(CanJoinAllSpaces=true FullScreenAuxiliary=true) | level before=3 after=25
```

If the diagnostic line is missing, the user is running a stale binary — `pkill -f Dictivo` first.

---

## 3. Short-term TODO — in priority order

### S1. Fix the fullscreen bug (above) — **blocking**

This is the gating issue for the entire v1.0 launch promise of "always available." Plan C1 → C3 → C4. Do not move on without this fixed.

### S2. Voicy-style information architecture for the bubble

The previous engineer surveyed Voicy's floating widget and identified 4 specific improvements. The user explicitly asked for them and they were deferred behind the fullscreen fix.

| ID | Change | Approx work |
|---|---|---|
| a | Add a "cheer / stat" pill in the complete state: "N words saved. Looking sharp!" — green pill with check icon, replaces / augments the current `sub` text | 1.5h CSS + a new conditional render path |
| b | Persistent hotkey hint at the bubble bottom: `Start: ⌘⇧Space` with a keycap-style box | 1h — render a `<kbd>` element styled in `app.css` |
| c | Explicit text "Hide" button (currently only a small X icon in the top-right) | 30min — additional button in the bubble footer |
| d | Status text → dark pill treatment (give the title visual weight equal to the cheer pill) | 30min CSS |

Source of inspiration: see screenshots referenced in the chat history; the bubble layout we want roughly matches Voicy's stacked-pill design while keeping our avatar on the left and the live waveform during recording.

### S3. Verify and stabilize companion expand/collapse

The 0.2.4 dogfood showed the companion window staying at 92×92 because the `core:window:allow-set-size` Tauri capability was missing. That was fixed in 0.2.4. **Spot-check** in 0.2.8+ that the window actually grows to 360×100 in non-idle phases. If it doesn't, the capability fix may have regressed silently.

### S4. Auto-revert phase from `complete` back to `idle`

Currently after a dictation finishes, the companion shows the "complete" state indefinitely until the next phase transition. The original design said the green halo settle animation should fade and the bubble should auto-collapse back to idle after ~2 seconds. Verify whether this is happening; if not, add a `setTimeout` in `App.tsx`'s post-dictation flow that flips `dictationPhase` back to `"idle"` after 2s.

### S5. Make Iris and Marcus avatar PNGs match the new "serious product" positioning

Both avatars are cartoon characters in beach attire. While the user explicitly accepted them after renaming them from "Bikini"/"Muscle", they remain stylistically inconsistent with the privacy-tool positioning targeting US + Western European knowledge workers. Two paths:

1. **Replace the art** — commission or generate new abstract / professional cartoon avatars for Iris and Marcus.
2. **Retire them entirely** — keep only Dog / Cat / Custom and drop the human avatars.

Discuss with the user before acting; this is a brand decision, not a tech decision.

### S6. Sound design polish

The 0.2.7 sound picker has 5 variants. User chose `triple` (Triple beep). Acceptable for v1.0. Consider:

- Adding a "no sound" option for users who find any chime distracting.
- Adding a separate **stop sound** (falling tone) — currently only the start has audio feedback.

### S7. Build a real CI release pipeline test

`release-desktop.yml` is written but never run end-to-end against real Apple Developer secrets (Apple enrollment is still blocked at identity verification — see external dependencies). Once Apple Developer clears, tag `v1.0.0-rc.1` and watch the workflow. Likely needs a few small fixes the first time.

---

## 4. Long-term TODO — deferred

In rough order of urgency:

### External-blocked

- **Apple Developer enrollment** — currently stuck at "Deine Identität konnte nicht bestätigt werden" identity-verification screen at `appleid.apple.com`. User should retry every 24h; if 3+ weeks pass, contact Apple Developer Support.
- **Lemon Squeezy KYC** — submitted, awaiting approval (~24-72h was the expectation; if not approved by 2026-05-18 user should follow up).
- **`dictivo.app` Cloudflare DNS** — already done.
- **Marketing site** (`Rswcf/Dictivo-site` / local `034_Dictivo_Site`) — deployed via its own workflow. The Buy buttons currently have `REPLACE_WITH_LEMON_SQUEEZY_CHECKOUT_URL` placeholders that need real URLs once LS clears.

### Product decisions to make (with the user)

- **6-month grandfather clause for v1 → v2** — Pixelmator-style: anyone who bought v1 within 6 months of v2 release gets v2 free. Decide before v1.0 launch.
- **Free tier final scope** — currently locked: `tiny` model only. Re-evaluate after first 100 paid users.
- **Founder Lifetime offer** — first N buyers get lifetime updates. Discussed, undecided.
- **Student / EDU discount mechanism** — discount code? Manual verification? Defer to v1.1.
- **Team / Org licenses** — Defer to v1.1.
- **Mac App Store secondary distribution** — Locked deferred to v1.1.
- **Open-source policy** — Locked: FSL-1.1-MIT (source-available, 2-year MIT conversion). Don't change.
- **Crash reporting policy** — Locked: never. Marketing position.

### Engineering tasks parked

- **SQLite migration infrastructure** — Plan written in `docs/release/sqlite-migration-plan.md`, code not landed. Land before the first real schema change.
- **A11y deeper audit** — VoiceOver pass, WCAG contrast check, reduced-motion respect. Checklist in `docs/release/launch-checklist.md` §4.
- **`BETA` chip toggle** in `App.tsx` — currently hardcoded `<span className="beta-chip">BETA</span>`. Switch to env-flag-gated for v1.0 tag.
- **Windows v1.1 support** — code-signing through Azure Trusted Signing (~$120/yr). Capabilities and workflow already drafted; just needs Apple to clear so the Mac path is stable first.
- **Marketing site privacy / EULA pages** — Templates in `docs/release/_v1-reference/eula-and-privacy.md`. Need real legal review before $10k annual revenue (per `docs/release/plan.md` §10.2).
- **`/where-your-data-lives` page** on the marketing site — content in `docs/release/launch/where-your-data-lives.md`, needs deployment.
- **Show HN + Product Hunt launch kits** — content in `docs/release/launch/` ready, needs execution on launch day.

---

## 5. Locked product decisions (do not relitigate)

| Decision | Value |
|---|---|
| Business model | $49 one-time purchase + 12-month update window + $24/yr optional renewal + **perpetual fallback** (the version you have keeps working forever, offline, no server check) |
| Launch price | **$49 USD** |
| Renewal price | **$24/yr** |
| Refund window | 14 days, full, no questions |
| Distribution | Dual-track: own site (Lemon Squeezy as MoR) primary, Mac App Store deferred to v1.1 |
| Target market | US + Western Europe knowledge workers, English-only at launch, USD-primary pricing |
| Free tier | Yes — `tiny` model unlimited, no time limit |
| Payment processor | Lemon Squeezy (Merchant of Record, handles global tax) |
| License model (code) | FSL-1.1-MIT, source-available, auto-converts to MIT after 2 years per release |
| Telemetry | **None ever** — no crash reporter, no analytics SDK, no usage tracking. Even opt-in is out. Marketing position. |
| First-launch platform | macOS only at v1.0. Windows in v1.1. |
| Seller | Solo natural-person indie (user is in Germany; no legal entity at launch; LS handles cross-border tax) |

Source of truth: `docs/release/plan.md`. Don't make decisions without reading that.

---

## 6. Versioning policy

From `docs/release/versioning.md`:

- **Patch** (`x.y.Z`) — every push that ships a bug fix or small feature change. Default.
- **Minor** (`x.Y.0`) — significant refactor or new top-level feature.
- **Major** (`X.0.0`) — **only the project lead bumps this.** Re-marketing event.

**Every code-shipping push touches all 7 manifest files together** (plus regenerated lockfile):

```
package.json                              "version"
apps/desktop/package.json                 "version"
apps/desktop/package.json                 "@dictivo/shared" dep
apps/desktop/src-tauri/Cargo.toml         version
apps/desktop/src-tauri/tauri.conf.json    "version"
apps/api/package.json                     "version"
apps/api/package.json                     "@dictivo/shared" dep
packages/shared/package.json              "version"
package-lock.json                         (npm install)
apps/desktop/src-tauri/Cargo.lock         (cargo check refreshes the dictivo entry)
```

The previous engineer used this bash recipe for bumps:

```bash
for f in package.json apps/desktop/package.json apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/tauri.conf.json packages/shared/package.json apps/api/package.json; do
  sed -i.bak 's/"version": "OLD"/"version": "NEW"/; s/version = "OLD"/version = "NEW"/; s/"@dictivo\/shared": "\^OLD"/"@dictivo\/shared": "^NEW"/' "$f"
  rm -f "$f.bak"
done
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml  # refreshes Cargo.lock
npm install                                                     # refreshes package-lock.json
```

The `version.test.ts` test verifies all files agree — it'll fail loudly if any is missed.

---

## 7. Build / test / push commands

### Local build (Mac arm64, unsigned, for dogfood)

```bash
npm run tauri:build -w @dictivo/desktop -- --bundles app --target aarch64-apple-darwin --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

Then `cp -R apps/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Dictivo.app /Applications/`.

### Test suite

```bash
npm run typecheck -w @dictivo/desktop
npm run test -w @dictivo/desktop          # vitest unit
npm run e2e -w @dictivo/desktop           # Playwright e2e
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml
```

CI runs all of these — keep them green locally before pushing.

### Common pitfalls observed

- **Cargo.lock drift**: after a version bump, you must run `cargo check` so the lockfile's `dictivo` entry updates. The `version.test.ts` snapshot catches this. The previous engineer was burned by `tail` swallowing the test exit code in a chained command — verify each step succeeds before chaining.
- **Tauri capability allow-list is strict**: any new window API call (setSize, setFocus, unminimize, etc.) requires an explicit entry in `apps/desktop/src-tauri/capabilities/default.json`. Silent fail otherwise.
- **`createUpdaterArtifacts: true`** in `tauri.conf.json` forces the build to require Tauri signing keys. Local dogfood builds use `--config '{"bundle":{"createUpdaterArtifacts":false}}'` to skip it; CI/release builds use the real keys from GitHub secrets.
- **macOS Accessibility permission resets when the binary signature changes**: ad-hoc signed dogfood builds may prompt for it each time. Real signed builds (post-Apple-Developer approval) won't have this issue.

---

## 8. Recent commit log (newest first)

```
69b588b fix(companion): raise NSWindow level to status (25) for fullscreen overlay  ← 0.2.8
c4e5486 feat(sounds): 5 selectable start chimes — let the user pick                 ← 0.2.7
7c514cb feat(companion): startup chime + defence-in-depth fullscreen-aux re-apply   ← 0.2.6
8476815 fix(companion): keep widget visible over macOS fullscreen apps too          ← 0.2.5
9f508c2 fix(companion): grant the four Tauri window capabilities the redesign needed ← 0.2.4
28ec85c feat(companion): edge-snap drag + position memory + click-to-record + long-press ← 0.2.3
80911fa fix: sync Cargo.lock to 0.2.2
29c6723 feat(companion): frosted glass bubble, state halo, compact idle, live waveform ← 0.2.2
6ce23a4 docs: lock in versioning policy, launch checklist, sqlite plan, no-tr…
4b8cf99 docs: add FSL-1.1-MIT LICENSE and THIRD-PARTY-NOTICES
af1f563 feat: rename Bikini/Muscle avatars to Iris/Marcus + bump to 0.2.1
140e294 ci: thread Tauri signing key through the validation build
48d97c7 fix(updater): guard UpdateBanner listen() behind isTauriRuntime()
cead32d docs: launch artifacts — Show HN draft, PH kit, data-residency page
3455ff1 feat: export entire history as a single Markdown bundle
59a613c feat: dictivo:// deep link for one-click license activation
a23c285 feat: polish License & Updates UI and license activation errors
f6898c9 feat: remove Trump companion avatar for v1.0 launch
2094c05 chore: realign release infra to separate marketing-site repo
7990d52 feat: integrate Tauri updater plugin + Lemon Squeezy license activation
```

---

## 9. Key files index

### Code

- `apps/desktop/src/App.tsx` — main React app, dictation state machine, hotkey registration
- `apps/desktop/src/components/CompanionWindow.tsx` — floating widget UI
- `apps/desktop/src/components/SettingsView.tsx` — Settings panel
- `apps/desktop/src/components/UpdateBanner.tsx` — non-blocking update notice
- `apps/desktop/src/lib/sounds.ts` — 5 start-sound variants
- `apps/desktop/src/lib/settingsStore.ts` — settings persistence + normalization
- `apps/desktop/src/lib/deepLink.ts` — `dictivo://activate?key=...` parsing
- `apps/desktop/src-tauri/src/lib.rs` — Tauri setup, command registration, tray
- `apps/desktop/src-tauri/src/companion_macos.rs` — **the bug lives here**, FullScreenAuxiliary + level fix
- `apps/desktop/src-tauri/src/license.rs` — Lemon Squeezy activation + offline cache
- `apps/desktop/src-tauri/src/updater.rs` — Tauri updater wrapper + window-gated logic
- `apps/desktop/src-tauri/tauri.conf.json` — window config (incl. visibleOnAllWorkspaces)
- `apps/desktop/src-tauri/capabilities/default.json` — Tauri permission allow-list

### Docs (read these)

- `docs/release/plan.md` — the lean 305-line launch plan; single source of truth
- `docs/release/SETUP.md` — step-by-step for the user (Apple Developer, LS, DNS)
- `docs/release/versioning.md` — bump rules
- `docs/release/launch-checklist.md` — v1.0 gating checklist
- `docs/release/sqlite-migration-plan.md` — pre-emptive plan for schema changes
- `docs/release/eula-and-privacy.md` (in `_v1-reference/`) — clauses, EULA template direction
- `docs/release/launch/show-hn.md` — Show HN post draft + canned replies
- `docs/release/launch/product-hunt-kit.md` — PH launch kit
- `docs/release/launch/where-your-data-lives.md` — marketing site privacy page content
- `LICENSE` — FSL-1.1-MIT
- `THIRD-PARTY-NOTICES.md` — dep license inventory
- `CONTRIBUTING.md` — contribution rules incl. versioning

### Memory (Claude's persistent state)

- `~/.claude/projects/-Users-mayijie-Projects-Code-033-Dictivo/memory/MEMORY.md` — index
- `~/.claude/projects/-Users-mayijie-Projects-Code-033-Dictivo/memory/project_dictivo_scale.md` — full project context for future sessions
- `~/.claude/projects/-Users-mayijie-Projects-Code-033-Dictivo/memory/user_location_germany.md` — user is in Germany; relevant for tax / legal default selection
- `~/.claude/projects/-Users-mayijie-Projects-Code-033-Dictivo/memory/feedback_right_size_to_scale.md` — don't over-engineer for indie scale

---

## 10. Open questions for the user — answer before proceeding

These were asked over the chat history but never answered, and need answers to make further decisions:

1. **Founder Lifetime offer**: yes/no? Cap at first N buyers? Pricing?
2. **6-month grandfather clause for v1 → v2 paid upgrade**: yes/no?
3. **Voicy redesign — a/b/c/d**: which of the 4 sub-improvements to do? User originally said "all of them" but the fullscreen bug took priority.
4. **Apple Developer status check**: is identity verification still blocking, or has it cleared since the last update?
5. **Lemon Squeezy KYC status**: cleared yet?
6. **Iris / Marcus avatar art**: keep as-is, replace with new art, or retire entirely?

---

## 11. Note from the outgoing engineer

The companion-window-in-fullscreen bug ate 4 patches (0.2.5 → 0.2.8) and I never got it working. The most likely root cause based on what I've read is that Tauri's `NSWindow` (not `NSPanel`) is structurally incompatible with the "visible over fullscreen" requirement on modern macOS, regardless of what flags we set. Plan C1 (style mask conversion) or C3 (manual NSPanel construction) is most likely the correct path. The `tauri-nspanel` plugin search (C4) is the fastest first-pass — if it exists and supports Tauri 2, drop it in and move on.

Everything else — codebase, tests, docs, release pipeline, marketing copy — is in a shippable shape for v1.0. The bug above is the only thing in the way of declaring the dogfood phase done.

Good luck.
