# Stitch-style UI Redesign — Design

**Status:** Draft for review
**Date:** 2026-05-12
**Scope:** `apps/desktop` frontend only. **Zero functional change.** No new commands, no API change, no state-machine change, no Rust touched.

---

## 1. Goals & Non-goals

**Goals:**

- Replace the current Calm Native light theme (perceived as "default admin template") with a distinctive **Stitch-aesthetic** (Google's AI design product) visual language.
- Lead with the privacy promise: "Private Dictation." as the H1, with a concrete sub-line that names what stays local.
- Re-label the top-right language chip from a bare `English ▾` to `Speaking in · English ▾` so non-technical users understand it's the language they're speaking in.
- Pull design moves directly observed in real Stitch screenshots: near-black canvas + dot-grid texture, huge display H1 in Google Sans 900, single purple accent `#a78bfa`, M3 segmented chips, an outlined `BETA` pill, and a bottom-right floating Companion card (mirroring Stitch's in-app "Transcript / 75 seconds" widget).

**Non-goals:**

- No functional changes. Wizard flow, hotkey behavior, tier resolution, benchmark, history, dictionary, snippets, paste flow, companion floating window, settings store schema, all Tauri commands — untouched.
- No new components beyond the three small additions in §5.
- No light-mode in this round. Stitch is dark-first and the redesign embraces that. (System-preference light mode can be added later.)
- The bug where `RunnableTiers` is empty after onboarding (cache fingerprint mismatch) is **out of scope** — that's a runtime/cache issue, tracked separately. The redesign targets the spec'd state where 1-3 tiers are visible.

---

## 2. Design Tokens

```
canvas        #0a0a0c   /* near-pitch-black, deeper than Stitch's wordmark bg */
canvas-deep   #07070a   /* sidebar + footer-tag */
surface-1     #14141a   /* capture card glass */
surface-2     rgba(20, 20, 24, 0.6)  /* tier shell + suggestion chips */
ink           #f1f3f4   /* display text */
ink-2         #e8eaed   /* body text */
muted         #9aa0a6   /* secondary text */
faint         #80868b   /* footer meta */
hairline      rgba(255, 255, 255, 0.05)
hairline-2    rgba(255, 255, 255, 0.08)

accent        #a78bfa   /* SINGLE purple — no gradient */
accent-soft   rgba(167, 139, 250, 0.16)
accent-text   #c4b5fd
accent-glow   rgba(167, 139, 250, 0.35)

success       #81c995   /* engine-ready dot */
cyan-mono     #5eead4   /* mono-styled time/duration callouts */

font-display  'Google Sans', system-ui, sans-serif  /* 900 weight for H1 */
font-body     'Google Sans Text', system-ui, sans-serif
font-mono     'JetBrains Mono', ui-monospace, monospace

radius-card   24px
radius-pill   999px
radius-fab    30px  /* M3-style squircle */

dot-grid      radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px) 24px 24px
```

Tokens are CSS variables in `:root` of `app.css`. No `@media (prefers-color-scheme: light)` block.

---

## 3. Layout

### 3.1 Shell

```
┌────────────────────────────────────────────────────────────────────┐
│ [traffic]                                                          │
├──────┬─────────────────────────────────────────────────────────────┤
│  72  │   main (dot-grid bg)                                        │
│  px  │                                                             │
│sidebr│   [topbar:  H1 + BETA + promise            | lang-chip ]    │
│      │   [suggestion chips row]                                    │
│      │   [mode chips row]                                          │
│      │   [capture stage card]                                      │
│      │      mic FAB                                                │
│      │      hint                                                   │
│      │      tier shell (segmented)                                 │
│      │   [footer: meta chips                | session/words ]      │
│      │                                              [float card] ▾ │
└──────┴─────────────────────────────────────────────────────────────┘
```

### 3.2 Sidebar (72px, icon-only)

- Background `--canvas-deep`
- 36×36 brand mark at top: rounded-10 purple square with white-on-purple 900-weight "D"
- 4 nav icons (44×44, radius-12). Active = `--accent-soft` background + `--accent-text` color. Inactive = `--muted` color, transparent background, hover `rgba(255,255,255,0.04)` background.
- The currently-selected companion mascot (Dog/Cat/Trump/Bikini/Muscle) renders at the bottom of the sidebar as a 40×40 circular avatar — a small ambient personality touch.

### 3.3 Main heading block

```html
<div class="title-row">
  <h1>Private Dictation.</h1>
  <span class="beta-chip">BETA</span>
</div>
<p class="promise">
  Audio, transcripts, dictionary, snippets —
  <b>everything stays on this device</b>.
  No cloud round-trip, no API keys, no account required.
</p>
```

- H1: `Google Sans 900`, **64px** (cap to `clamp(48px, 6vw, 64px)` for narrow windows), `letter-spacing: -0.025em`, `line-height: 0.95`, `#f1f3f4`.
- BETA chip: 13px / 700, off-white text, hairline border `rgba(255,255,255,0.22)`, padding `6px 13px 5px`, letter-spacing `0.1em`.
- Promise sub-line: 16px / 400, `--muted` color, `max-width: 56ch`. The phrase `everything stays on this device` is wrapped in `<b>` styled as `font-weight: 500; color: var(--accent-text)`.

### 3.4 Top-right language chip

- Label changes from `English ▾` to **`Speaking in · English ▾`**.
- Rendered as `🌐 Speaking in · {LANGUAGE_LABELS[language]} ▾` in a pill: padding `8px 14px 8px 12px`, `rgba(255,255,255,0.04)` bg, hairline border, 13px / 500.
- The dropdown itself is unchanged in markup — only the rendered label changes. Functionally still the existing `<select>` styled as the pill.

### 3.5 Suggestion chips row

New row, sits between the heading block and the mode chips:

```
[⌥Space] Hold and speak    [⌥⇧V] Paste last transcript    Resume from history…
```

- 3 pills, gap 8px
- Each pill: `rgba(255,255,255,0.04)` bg, hairline border, 12px / 500 text, padding `8px 14px`, radius 999px
- Keystroke prefix is a 10px JetBrains Mono badge with `--accent-soft` background and `--accent-text` color
- The three pills currently are non-interactive labels (purely visual / hotkey hints); making them actionable is out of scope for this redesign

### 3.6 Mode chips (M3 segmented)

The existing mode strip becomes a segmented pill group:

- 4 buttons: Message / Email / Raw / Prompt
- Inactive: transparent bg, hairline border, `#c4c7c5` text, 13px / 500
- Active: `--accent-soft` bg, `--accent-text` color, border `rgba(167, 139, 250, 0.3)`
- Padding `8px 18px`, radius 999px
- Same `onModeChange` callback — no logic change

### 3.7 Capture stage

The white textarea-with-mic-inside becomes a **glass card** with the mic as a focal point:

- Card: `surface-1` translucent bg, radius 24px, hairline border, padding `56px 40px`, `display: grid; place-items: center`, `backdrop-filter: blur(20px)`
- Mic FAB: **96×96 squircle** (radius 30px), filled `--accent`, color `--canvas`, font-size 34px, soft directional shadow only (no large outer glow — user feedback "光晕太亮"):
  - `box-shadow: 0 1px 0 rgba(255,255,255,0.4) inset, 0 6px 20px -6px rgba(167,139,250,0.35)`
- Hint line: 14px / 400, `--muted`. Embeds keystroke pills (`⌥` `Space`) styled with `rgba(255,255,255,0.06)` bg.
- The textarea where the live transcript appears stays inside this card — but is hidden until recording starts (no value yet means just show the mic + hint). When `liveText` populates, the textarea fades in below the mic.

### 3.8 Tier selector (M3 segmented)

Replaces the current 3-button row with a segmented pill group:

- Outer shell: `surface-2` bg, hairline border, radius 999px, padding 4px, `align-self: center`
- Inner buttons: transparent, `--muted` color when inactive, 12px / 500
- Active: `--accent` fill (full purple), `--canvas` text, 700 weight
- Tier filtering logic unchanged — only render available tiers from `runnableTiers`

### 3.9 Footer status

Replaces the current comma-separated single line with two regions:

```
[● Engine ready] [⚡ Metal] [small]                   0 words · session #14
```

- Left: 3 meta-chips (`rgba(255,255,255,0.04)` bg, radius-pill, 11px). First chip has a `--success` dot.
- Right: muted 11px text showing session number + word count
- The redundant "Transcript stays on this device" is gone — already promised at the top
- Border-top hairline separates from the capture stage

### 3.10 Floating Companion card (NEW)

A small inline preview of the current companion mascot, anchored bottom-right of the dictation page:

- `position: absolute; right: 24px; bottom: 24px`
- Dark card 100×56-ish: `rgba(14,14,18,0.92)` bg, hairline border, radius 14px, soft shadow
- Avatar circle (28×28) on left showing the current `companionAvatar` SVG/PNG
- Right text block: top line "Standing by" (muted 11px), bottom line `⌥+Space` in mono 13px with `--cyan-mono` color
- This is **separate from** the existing standalone Tauri companion window (which lives in its own `label: "companion"` window). The inline card is purely a visual hint on the main page; the floating window remains for users who want it as a separate always-on-top overlay.
- The avatar + state in the inline card subscribes to the same `companionSnapshot` state already computed in `App.tsx` — no new state needed.

---

## 4. Copy & i18n

| Element | Text |
| --- | --- |
| H1 | `Private Dictation.` (literal, one period, no Stitch-style trailing dots) |
| BETA chip | `BETA` |
| Promise sub-line | `Audio, transcripts, dictionary, snippets — everything stays on this device. No cloud round-trip, no API keys, no account required.` |
| Language chip | `🌐 Speaking in · {LANGUAGE_LABELS[language]} ▾` |
| Suggestion chips | `Hold and speak` / `Paste last transcript` / `Resume from history…` (preceded by their hotkey labels) |
| Capture hint | `Tap the mic, or press ⌥ Space.` |
| Footer left | meta chips: `Engine ready` / `⚡ Metal` / model id |
| Footer right | `{wordCount} words · session #{N}` |
| Floating card | `Standing by` (title) / `⌥+Space` (sub) when idle |

English copy only in this round. Existing `@dictivo/shared` `LANGUAGE_LABELS` map (`en`, `zh`, `es`, `ja`, `fr`, `de`, `vi`) feeds the language chip dropdown unchanged. The new English copy strings are inlined in components for now (no `i18n.ts` introduction — that's a bigger lift outside this redesign's scope).

---

## 5. Component-level Changes

### Files modified (no creates)

- `apps/desktop/src/styles/app.css` — wholesale rewrite to the new token system and component styles. Target ~700-900 lines. Existing 413-line Calm Native CSS is replaced, not appended.
- `apps/desktop/src/App.tsx` — change the topbar JSX from `<h1>{viewTitle(view)}</h1>` + bare lang select to the new heading-block + lang-chip; pass `companionSnapshot.avatar` down to `<DictationWorkbench>` for the floating-card preview. Remove the existing `<aside className="brand-block">` subtitle (`Local AI dictation`) and `<div className="privacy-chip">` — both retired by the new heading-block.
- `apps/desktop/src/components/DictationWorkbench.tsx` — replace internal layout: header block, suggestion chips, mode chips, capture stage with FAB, tier selector, footer chips, floating companion card. Drop the textarea-with-mic-inside arrangement. Same prop contract plus one new prop `companionAvatar: CompanionAvatar` and `companionEnabled: boolean` (forwarded from App.tsx) for the floating card. `rawText` / `onCopyRaw` props remain unused and can stay declared but unread (already optional after the previous redesign).

### Files unchanged (verify)

- `apps/desktop/src/components/TierSelector.tsx` — its own component file; the new M3 segmented look is implemented inside this component, so it gets a style refresh but no contract change. Optionally: skip TierSelector.tsx and inline the chip group directly in DictationWorkbench's JSX (since this redesign is making DictationWorkbench taller anyway). **Pick inline** — TierSelector.tsx becomes dead and is deleted in this redesign.
- `apps/desktop/src/components/OnboardingWizard.tsx` — restyle pass to match dark/purple tokens but no functional change. (Wizard is shown to first-launch users.)
- `apps/desktop/src/components/SettingsView.tsx`, `ModelManager.tsx`, `HistoryView.tsx`, `DictionaryView.tsx`, `CompanionWindow.tsx` — style refresh only, prop contracts unchanged.
- `apps/desktop/src/lib/*` — completely unchanged.
- All Rust, all tests, all Tauri config — completely unchanged.

### Component tree of the dictation page after redesign

```
<main class="app-shell">           // grid 72px + 1fr
  <aside class="sidebar">          // icon-only, dark
    <BrandMark />
    <NavIcon view="dictation" active />
    <NavIcon view="history" />
    <NavIcon view="dictionary" />
    <NavIcon view="settings" />
    <MascotMini avatar={companionAvatar} />
  </aside>
  <section class="workspace">      // dot-grid bg
    <DictationWorkbench>
      <header class="topbar">
        <div class="heading-block">
          <h1>Private Dictation.</h1>
          <span class="beta-chip">BETA</span>
          <p class="promise">…</p>
        </div>
        <LanguageChip />           // existing <select> restyled
      </header>
      <SuggestionChips />          // static labels for now
      <ModeChips />                // M3 segmented
      <CaptureStage>
        <MicFab onClick={onToggleDictation} />
        <Hint />
        <TierChips />              // M3 segmented, replaces TierSelector
      </CaptureStage>
      <FooterStatus />
      <FloatingCompanionCard avatar={companionAvatar} phase={companionPhase} />
    </DictationWorkbench>
  </section>
</main>
```

### Tests

- `apps/desktop/tests/componentsStatic.test.tsx` will fail on the existing assertions ("Local Dictation" / "Standing by" placeholders / pre-redesign DOM structure). Updates are in scope: the test gets new assertions matching the new DOM (look for `Private Dictation.`, `BETA`, `Speaking in`, `Hold and speak`).
- `apps/desktop/tests/wireframeVisual.test.ts` asserts the existence of design-token CSS variables. Tokens change (cyberpunk → calm → now stitch); test needs to be updated to assert the new tokens (`--accent` = `#a78bfa`, `--canvas` = `#0a0a0c`, dot-grid bg-image present).
- `apps/desktop/e2e/app.spec.ts` may need a heading selector update (`"Dictation Workbench"` → `"Private Dictation."`).
- Vitest count target after: 55+ (no test deletions).

---

## 6. Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| The dot-grid `radial-gradient` may render poorly on certain GPUs / low-DPI screens. | Use a CSS `background-image` with `background-attachment: local` (default). Fallback acceptable — at worst the dots are slightly larger. Add a `@media (prefers-reduced-motion)` no-op (no motion in this design, so no extra work). |
| Google Sans is not bundled. The Google Fonts CDN must load it. | Add `<link rel="preconnect">` + `<link rel="stylesheet">` for `Google+Sans` and `Google+Sans+Text` to `apps/desktop/index.html`. If offline, browsers fall back through the font stack to `system-ui` — acceptable degradation. |
| The 64px H1 may overflow narrow windows. | Use `clamp(48px, 6vw, 64px)` so it scales down to 48px on smaller widths. Also `white-space: nowrap` on `Private Dictation.` since it's a fixed 17-char string. |
| Existing onboarding wizard CSS uses the old `.wizard-card` / `.wizard-shell` selectors. | The new app.css preserves those class names but restyles them to the dark/purple palette. No JSX change in the wizard component. |
| TierSelector being empty (the runtime bug noted earlier) leaves the capture stage missing the segmented tier control. | Acceptable — the bug is separate. The redesign renders the tier shell whenever `runnableTiers` has any non-null entry; otherwise the tier shell is omitted (existing TierSelector behavior). |

---

## 7. Definition of Done

- `npm run typecheck -w @dictivo/desktop` → 0 errors
- `npm run test` (all workspaces) → all green
- `npm run build -w @dictivo/desktop` → success
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` → unchanged result (we touched no Rust)
- A fresh `tauri:build` produces a `.app` whose dictation page matches the v3 mockup at `.superpowers/brainstorm/.../content/stitch-style-v3.html`
- The currently visible page elements all remain functional: hotkey toggle records, mode pills switch the polishing template, language chip updates `language` state, tier chips drive `selectedTier`, settings page opens unchanged.
- The redesign does NOT regress the floating Tauri Companion window (separate `label: "companion"` Tauri window).
