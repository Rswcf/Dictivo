# Stitch-style Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repaint Dictivo's desktop frontend in Google Stitch's visual language — pitch-black canvas + dot grid + Google Sans 900 H1 + single purple accent + M3 segmented chips + outlined BETA pill + floating Companion preview. Zero functional change.

**Architecture:** Single PR. Wholesale rewrite of `apps/desktop/src/styles/app.css` to new Stitch tokens. Surgical rewrite of `App.tsx` heading block + sidebar; full rewrite of `DictationWorkbench.tsx` layout. Delete `TierSelector.tsx` (inlined). Restyle pass on the other surfaces (Settings, History, Dictionary, ModelManager, OnboardingWizard, CompanionWindow) — same JSX, new CSS. Update unit + e2e tests to match new DOM strings.

**Tech Stack:** React 19, TypeScript, Vite, Tauri 2, Google Sans (via Google Fonts CDN), JetBrains Mono.

**Spec:** `docs/superpowers/specs/2026-05-12-stitch-style-redesign-design.md`

---

## Repository Conventions

- All `npm` commands run from repo root unless noted.
- TS tests: `npm run test -w @dictivo/desktop`
- E2E: `npm run e2e -w @dictivo/desktop`
- Tauri build: `npm run tauri:build -w @dictivo/desktop`
- Commit per task. Subject ≤ 72 chars, imperative. Always include the Co-Authored-By line.

---

## File Structure (locked decomposition)

**Modified files:**

- `apps/desktop/index.html` — add Google Fonts preconnect + stylesheet links
- `apps/desktop/src/styles/app.css` — wholesale rewrite (~750 lines, replaces the ~413-line Calm Native file)
- `apps/desktop/src/App.tsx` — restructure topbar to heading-block (H1 + BETA + promise); drop subtitle + privacy-chip; add MascotMini in sidebar; update lang chip label to "Speaking in · …"; pass `companionAvatar` + `companionEnabled` to `<DictationWorkbench>` for the inline floating card
- `apps/desktop/src/components/DictationWorkbench.tsx` — full rewrite (suggestion chips, mode chips, FAB capture, inline tier chips, footer chips, floating Companion card)
- `apps/desktop/tests/componentsStatic.test.tsx` — update assertions for new DOM strings
- `apps/desktop/tests/wireframeVisual.test.ts` — update token assertions
- `apps/desktop/e2e/app.spec.ts` — update heading selector

**Deleted files:**

- `apps/desktop/src/components/TierSelector.tsx` — inlined into DictationWorkbench
- `apps/desktop/tests/tierSelector.test.tsx` — test for the deleted component

**Unchanged (verified post-redesign):**

- All Rust (`apps/desktop/src-tauri/`)
- All Tauri commands
- Settings store schema
- Bridge functions
- Companion floating-window contract (`label: "companion"`)
- Onboarding wizard logic
- `packages/shared`, `apps/api`

---

## Task 1: Google Sans + JetBrains Mono via index.html

**Files:**
- Modify: `apps/desktop/index.html`

- [ ] **Step 1: Replace `<head>` block**

Open `apps/desktop/index.html`. Replace the entire `<head>` section with:

```html
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Dictivo</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Google+Sans+Text:wght@400;500;700&family=Google+Sans:wght@400;500;700;900&family=JetBrains+Mono:wght@400&display=swap"
      rel="stylesheet"
    />
  </head>
```

- [ ] **Step 2: Verify build still passes**

Run: `npm run build -w @dictivo/desktop 2>&1 | tail -5`
Expected: Vite build success.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/index.html
git commit -m "$(cat <<'EOF'
feat(desktop): preload Google Sans + JetBrains Mono via Google Fonts

Stitch-style redesign requires Google Sans (display 900 weight for the
H1, body 500 weight) and JetBrains Mono for keystroke/meta. Adds the
standard Google Fonts preconnect + stylesheet links.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Rewrite `app.css` to Stitch tokens

**Files:**
- Replace: `apps/desktop/src/styles/app.css`

- [ ] **Step 1: Replace the entire file**

Overwrite `apps/desktop/src/styles/app.css` with the following content (this is the complete file, not a diff):

```css
:root {
  --canvas: #0a0a0c;
  --canvas-deep: #07070a;
  --surface-1: #14141a;
  --surface-2: rgba(20, 20, 24, 0.6);
  --surface-3: rgba(14, 14, 18, 0.92);

  --ink: #f1f3f4;
  --ink-2: #e8eaed;
  --muted: #9aa0a6;
  --faint: #80868b;

  --hairline: rgba(255, 255, 255, 0.05);
  --hairline-2: rgba(255, 255, 255, 0.08);
  --hairline-3: rgba(255, 255, 255, 0.22);

  --accent: #a78bfa;
  --accent-soft: rgba(167, 139, 250, 0.16);
  --accent-text: #c4b5fd;
  --accent-glow: rgba(167, 139, 250, 0.35);

  --success: #81c995;
  --warning: #f9c440;
  --danger: #ff6f61;
  --cyan-mono: #5eead4;

  --font-display: "Google Sans", system-ui, sans-serif;
  --font-body: "Google Sans Text", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;

  --radius-sm: 6px;
  --radius: 10px;
  --radius-card: 24px;
  --radius-pill: 999px;
  --radius-fab: 30px;

  color-scheme: dark;
  font-family: var(--font-body);
  color: var(--ink-2);
  -webkit-font-smoothing: antialiased;
}

* { box-sizing: border-box; }

html, body, #root {
  min-height: 100vh;
  margin: 0;
}

body {
  background: var(--canvas);
  color: var(--ink-2);
}

body[data-window="companion"] {
  background: transparent;
  overflow: hidden;
}

button, input, select, textarea {
  font: inherit;
  color: inherit;
}
button { cursor: pointer; }

/* ========================================================
 * SHELL
 * ====================================================== */

.app-shell {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  background: var(--canvas-deep);
  border-right: 1px solid var(--hairline);
  padding: 14px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.brand-block {
  display: contents;
}

.brand-mark {
  width: 36px;
  height: 36px;
  border-radius: var(--radius);
  background: var(--accent);
  color: var(--canvas);
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-weight: 900;
  font-size: 16px;
  margin-bottom: 8px;
}

.brand-block strong,
.brand-block span,
.privacy-chip {
  display: none;
}

.nav-list {
  display: contents;
}

.nav-button {
  width: 44px;
  height: 44px;
  border: 0;
  background: transparent;
  border-radius: 12px;
  color: var(--muted);
  display: grid;
  place-items: center;
  font-size: 0;
  transition: background 200ms ease, color 200ms ease;
}
.nav-button svg { width: 18px; height: 18px; }
.nav-button:hover:not(.is-active) {
  background: rgba(255, 255, 255, 0.04);
}
.nav-button.is-active {
  background: var(--accent-soft);
  color: var(--accent-text);
}

.sidebar-mascot {
  margin-top: auto;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  display: grid;
  place-items: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}
.sidebar-mascot svg,
.sidebar-mascot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* ========================================================
 * WORKSPACE
 * ====================================================== */

.workspace {
  position: relative;
  padding: 36px 56px 28px;
  display: flex;
  flex-direction: column;
  gap: 22px;
  min-height: 100vh;
  background: var(--canvas);
}
.workspace::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: radial-gradient(
    circle,
    rgba(255, 255, 255, 0.06) 1px,
    transparent 1px
  );
  background-size: 24px 24px;
  pointer-events: none;
  z-index: 0;
}
.workspace > * { position: relative; z-index: 1; }

/* Heading block */

.topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}
.topbar .eyebrow { display: none; }

.heading-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 14px;
}
.topbar h1 {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 900;
  font-size: clamp(48px, 6vw, 64px);
  line-height: 0.95;
  letter-spacing: -0.025em;
  color: var(--ink);
  white-space: nowrap;
}

.beta-chip {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 13px;
  color: var(--ink-2);
  padding: 6px 13px 5px;
  border: 1px solid var(--hairline-3);
  border-radius: var(--radius-pill);
  letter-spacing: 0.1em;
  align-self: center;
  margin-top: 6px;
}

.promise {
  margin: 0;
  font-family: var(--font-body);
  font-size: 16px;
  font-weight: 400;
  line-height: 1.45;
  color: var(--muted);
  max-width: 56ch;
}
.promise b {
  color: var(--accent-text);
  font-weight: 500;
}

.toolbar {
  margin-top: 14px;
  flex-shrink: 0;
}
.toolbar .select-control {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px 8px 12px;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--hairline-2);
  color: var(--ink-2);
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 13px;
}
.toolbar .select-control::before {
  content: "🌐";
  font-size: 14px;
  opacity: 0.7;
}
.toolbar .select-control::after {
  content: "Speaking in · ";
  color: var(--muted);
  font-weight: 500;
}
.toolbar .select-control select {
  background: transparent;
  border: 0;
  color: inherit;
  font-size: 13px;
  font-weight: 500;
  appearance: none;
  -webkit-appearance: none;
  padding-right: 14px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='%239aa0a6'%3E%3Cpath d='M2 4l4 4 4-4z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right center;
  background-size: 12px 12px;
}

.status-banner {
  background: var(--surface-1);
  border: 1px solid var(--hairline-2);
  border-radius: var(--radius);
  padding: 10px 14px;
  font-size: 12px;
  color: var(--muted);
}

/* Suggestion chips */

.suggestion-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.suggestion-chip {
  padding: 8px 14px;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--hairline-2);
  color: #c4c7c5;
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
}
.suggestion-chip .key {
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 2px 5px;
  margin-right: 6px;
  background: var(--accent-soft);
  color: var(--accent-text);
  border-radius: 4px;
}

/* Mode chips (M3 segmented) */

.segmented {
  display: inline-flex;
  gap: 6px;
  align-self: flex-start;
}
.segmented button {
  border: 1px solid var(--hairline-2);
  background: transparent;
  color: #c4c7c5;
  padding: 8px 18px;
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 13px;
  transition: background 200ms ease, border-color 200ms ease;
}
.segmented button:hover:not(.is-selected) {
  background: rgba(255, 255, 255, 0.04);
}
.segmented button.is-selected {
  background: var(--accent-soft);
  color: var(--accent-text);
  border-color: rgba(167, 139, 250, 0.3);
}

/* Capture stage */

.dictation-workbench {
  display: flex;
  flex-direction: column;
  gap: 22px;
  flex: 1;
  min-height: 0;
}
.mode-strip {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mode-strip h2 { display: none; }
.signal-deck {
  display: flex;
  flex-direction: column;
  gap: 22px;
  flex: 1;
}

.capture-stage {
  position: relative;
  flex: 1;
  border-radius: var(--radius-card);
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 20px 50px -25px rgba(0, 0, 0, 0.5);
  padding: 56px 40px;
  display: grid;
  place-items: center;
  gap: 24px;
  text-align: center;
  backdrop-filter: blur(20px);
  overflow: hidden;
}
.capture-stage.is-recording .capture-orbit {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.4),
    0 0 0 4px rgba(255, 111, 97, 0.3),
    0 6px 20px -6px var(--accent-glow);
}

.capture-orbit {
  width: 96px;
  height: 96px;
  border-radius: var(--radius-fab);
  border: 0;
  background: var(--accent);
  color: var(--canvas);
  display: grid;
  place-items: center;
  font-size: 0;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.4),
    0 6px 20px -6px var(--accent-glow);
  transition: transform 200ms cubic-bezier(0.32, 0.72, 0, 1),
    background 200ms ease;
}
.capture-orbit svg { width: 34px; height: 34px; }
.capture-orbit:hover { transform: scale(1.03); background: #b59cfb; }
.capture-orbit:active { transform: scale(0.97); }

.capture-stage textarea {
  width: 100%;
  min-height: 80px;
  background: transparent;
  border: 0;
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 14px;
  text-align: center;
  resize: vertical;
}
.capture-stage textarea::placeholder {
  color: var(--muted);
}

.capture-hint {
  font-family: var(--font-body);
  font-weight: 400;
  font-size: 14px;
  color: var(--muted);
  line-height: 1.4;
}
.capture-hint kbd {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 3px 7px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  color: var(--ink-2);
  margin: 0 2px;
}

/* Tier selector (M3 segmented, inlined) */

.tier-selector {
  align-self: center;
  padding: 4px;
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-pill);
  display: inline-flex;
  gap: 2px;
}
.tier-button {
  border: 0;
  background: transparent;
  color: var(--muted);
  padding: 8px 20px;
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 12px;
}
.tier-button .name { font-weight: inherit; }
.tier-button .sub { display: none; }
.tier-button:hover:not(.is-selected) {
  background: rgba(255, 255, 255, 0.04);
}
.tier-button.is-selected {
  background: var(--accent);
  color: var(--canvas);
  font-weight: 700;
}

/* Footer status */

.workbench-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 14px;
  border-top: 1px solid var(--hairline);
  font-family: var(--font-body);
  font-weight: 400;
  font-size: 11px;
  color: var(--faint);
}
.workbench-footer .meta-chips {
  display: flex;
  gap: 8px;
}
.workbench-footer .meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 11px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: var(--radius-pill);
  color: #c4c7c5;
  font-size: 11px;
}
.workbench-footer .meta-chip .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
}

/* Floating Companion preview card */

.companion-preview {
  position: absolute;
  right: 24px;
  bottom: 24px;
  z-index: 5;
  padding: 12px 16px 12px 14px;
  background: var(--surface-3);
  border: 1px solid var(--hairline-2);
  border-radius: 14px;
  box-shadow: 0 18px 40px -20px rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 12px;
  color: var(--ink-2);
}
.companion-preview .avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  overflow: hidden;
  display: grid;
  place-items: center;
}
.companion-preview .avatar svg,
.companion-preview .avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.companion-preview .label {
  color: var(--muted);
  font-size: 11px;
}
.companion-preview .duration {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--cyan-mono);
  font-weight: 500;
}

/* ========================================================
 * SETTINGS
 * ====================================================== */

.settings-layout {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: 24px;
}
.settings-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.settings-nav button {
  text-align: left;
  background: transparent;
  border: 0;
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 13px;
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.settings-nav button:hover:not(.is-selected) {
  background: rgba(255, 255, 255, 0.04);
}
.settings-nav button.is-selected {
  background: var(--accent-soft);
  color: var(--accent-text);
}

.side-panel {
  background: var(--surface-1);
  border: 1px solid var(--hairline-2);
  border-radius: var(--radius-card);
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ink);
}
.panel-title h2 {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 16px;
}

.recommend-card {
  border: 1px solid var(--accent);
  background: var(--accent-soft);
  border-radius: var(--radius);
  padding: 14px 16px;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink-2);
}
.recommend-card strong { color: var(--ink); font-weight: 600; }

.tier-card-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.tier-card {
  background: var(--surface-2);
  border: 1px solid var(--hairline-2);
  border-radius: var(--radius);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tier-card.is-recommended { border-color: var(--accent); }
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

details.advanced > summary {
  list-style: none;
  cursor: pointer;
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 12px;
  color: var(--muted);
  padding: 8px 0;
  user-select: none;
}
details.advanced > summary::before { content: "▸ "; color: var(--faint); }
details.advanced[open] > summary::before { content: "▾ "; }

.hotkey-grid {
  display: grid;
  gap: 8px;
}
.hotkey-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--hairline-2);
  border-radius: var(--radius);
  background: var(--surface-2);
}
.hotkey-row strong {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 13px;
  color: var(--ink);
}
.hotkey-row span {
  display: block;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--muted);
}

.toggle-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  font-size: 13px;
  color: var(--ink-2);
}

.text-button {
  background: transparent;
  border: 1px solid var(--hairline-2);
  border-radius: var(--radius-sm);
  padding: 6px 12px;
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 12px;
  color: var(--ink-2);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.text-button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.04);
}
.text-button:disabled { opacity: 0.5; cursor: default; }
.text-button.is-recording-shortcut {
  color: var(--accent-text);
  border-color: var(--accent);
}

/* Avatar picker (Settings -> Companion) */

.avatar-picker {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.avatar-picker button {
  background: var(--surface-2);
  border: 1px solid var(--hairline-2);
  border-radius: var(--radius);
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 11px;
  color: var(--ink-2);
}
.avatar-picker button.is-selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.avatar-chip {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.05);
}
.avatar-chip img,
.avatar-chip svg {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* ========================================================
 * COMPANION (Tauri floating window — separate from preview card)
 * ====================================================== */

.companion-shell {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  min-height: 100vh;
  background: transparent;
  -webkit-app-region: drag;
}
.companion-avatar-wrap {
  position: relative;
  width: 76px;
  height: 76px;
  flex-shrink: 0;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.25));
}
.companion-avatar {
  width: 100%;
  height: 100%;
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
  top: -4px;
  right: -6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 12px;
  color: white;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}
.companion-emote--rec  { background: var(--danger); }
.companion-emote--proc { background: var(--accent); }
.companion-emote--done { background: var(--success); }
.companion-emote--err  { background: var(--warning); }

.companion-bubble {
  position: relative;
  background: var(--surface-3);
  border-radius: 14px;
  padding: 12px 16px;
  min-width: 200px;
  max-width: 240px;
  box-shadow: 0 18px 40px -20px rgba(0, 0, 0, 0.6);
  border-top: 3px solid transparent;
  -webkit-app-region: drag;
  color: var(--ink-2);
}
.companion-bubble::before {
  content: "";
  position: absolute;
  left: -6px;
  top: 18px;
  width: 12px;
  height: 12px;
  background: var(--surface-3);
  transform: rotate(45deg);
  z-index: -1;
}
.companion-shell--recording  .companion-bubble { border-top-color: var(--danger); }
.companion-shell--processing .companion-bubble { border-top-color: var(--accent); }
.companion-shell--complete   .companion-bubble { border-top-color: var(--success); }
.companion-shell--error      .companion-bubble,
.companion-shell--blocked    .companion-bubble { border-top-color: var(--warning); }
.companion-title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 12px;
  line-height: 1.2;
}
.companion-timer {
  font-family: var(--font-mono);
  font-weight: 500;
  font-size: 20px;
  margin-top: 2px;
  color: var(--danger);
}
.companion-sub {
  font-family: var(--font-body);
  font-size: 11px;
  color: var(--muted);
  margin-top: 2px;
}
.companion-sub kbd {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--hairline-2);
  border-radius: 3px;
  padding: 0 4px;
  font: inherit;
  font-size: 10px;
}
.companion-hide-button {
  position: absolute;
  top: 4px;
  right: 6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 0;
  background: transparent;
  color: var(--faint);
  display: grid;
  place-items: center;
  opacity: 0;
  -webkit-app-region: no-drag;
}
.companion-shell:hover .companion-hide-button { opacity: 1; }

/* ========================================================
 * ONBOARDING WIZARD
 * ====================================================== */

.wizard-shell {
  display: grid;
  place-items: center;
  min-height: 100vh;
  background: var(--canvas);
  padding: 32px;
}
.wizard-shell::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: radial-gradient(
    circle,
    rgba(255, 255, 255, 0.05) 1px,
    transparent 1px
  );
  background-size: 24px 24px;
  pointer-events: none;
}
.wizard-card {
  position: relative;
  background: var(--surface-1);
  border: 1px solid var(--hairline-2);
  border-radius: var(--radius-card);
  width: min(520px, 92vw);
  padding: 32px 36px;
  box-shadow: 0 30px 80px -30px rgba(0, 0, 0, 0.7);
}
.wizard-steps {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-bottom: 20px;
}
.wizard-steps span {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--muted);
  display: grid;
  place-items: center;
  font-family: var(--font-mono);
  font-size: 11px;
  border: 1px solid var(--hairline-2);
}
.wizard-steps span.on {
  background: var(--accent);
  color: var(--canvas);
  border-color: var(--accent);
  font-weight: 700;
}
.wizard-card h2 {
  margin: 0 0 10px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 22px;
  color: var(--ink);
  letter-spacing: -0.01em;
}
.wizard-card .muted {
  margin: 0 0 18px;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--muted);
}
.wizard-card .error {
  color: var(--danger);
  font-size: 13px;
  font-weight: 500;
}
.wizard-card .hw-list {
  list-style: none;
  padding: 0;
  margin: 0 0 18px;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink-2);
}
.wizard-card .hw-list li {
  padding: 8px 0;
  border-bottom: 1px solid var(--hairline);
}
.wizard-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
}
.wizard-actions .primary {
  background: var(--accent);
  color: var(--canvas);
  border: 0;
  border-radius: var(--radius);
  padding: 10px 18px;
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 13px;
}
.wizard-actions .primary:disabled { opacity: 0.5; cursor: default; }
.wizard-actions .ghost {
  background: transparent;
  color: var(--muted);
  border: 0;
  border-radius: var(--radius);
  padding: 10px 18px;
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 13px;
}

/* ========================================================
 * HISTORY / DICTIONARY (light style refresh, structure unchanged)
 * ====================================================== */

.history-list,
.dictionary-list,
.snippet-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-card,
.dictionary-card,
.snippet-card {
  background: var(--surface-1);
  border: 1px solid var(--hairline-2);
  border-radius: var(--radius);
  padding: 12px 14px;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink-2);
}

input[type="text"],
input[type="search"],
input:not([type]),
select,
textarea {
  background: var(--surface-2);
  border: 1px solid var(--hairline-2);
  border-radius: var(--radius);
  color: var(--ink-2);
  padding: 8px 12px;
  font-family: var(--font-body);
  font-size: 13px;
}
input:focus,
select:focus,
textarea:focus {
  outline: 2px solid var(--accent-soft);
  outline-offset: 1px;
}
```

- [ ] **Step 2: Verify the build doesn't break**

Run: `npm run build -w @dictivo/desktop 2>&1 | tail -5`
Expected: success. Some Vitest assertions will fail in later tasks — that's expected and addressed in Task 5.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/styles/app.css
git commit -m "$(cat <<'EOF'
feat(desktop): Stitch tokens + dark canvas + dot grid CSS

Wholesale rewrite of app.css from Calm Native (light) to Stitch
aesthetic (dark). New tokens: --canvas #0a0a0c, --accent #a78bfa,
--cyan-mono #5eead4. Adds 24px dot-grid texture, Google Sans 900 H1
support, M3 segmented chips, M3 FAB-style mic, outlined BETA chip
container, floating companion-preview card, restyled wizard + tier
cards. Vitest assertions on the old tokens will break and are fixed
in the test-update task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Rewrite `DictationWorkbench.tsx` + delete `TierSelector.tsx`

**Files:**
- Replace: `apps/desktop/src/components/DictationWorkbench.tsx`
- Delete: `apps/desktop/src/components/TierSelector.tsx`
- Delete: `apps/desktop/tests/tierSelector.test.tsx`

- [ ] **Step 1: Replace DictationWorkbench.tsx**

Overwrite `apps/desktop/src/components/DictationWorkbench.tsx` with:

```tsx
import type { InputMode, ProcessingMode, SupportedLanguage } from "@dictivo/shared";
import { Mic, X as XIcon } from "lucide-react";
import { estimateWordCount } from "@dictivo/shared";
import trumpAvatarImage from "../assets/avatars/trump-companion.png";
import bikiniAvatarImage from "../assets/avatars/bikini-companion.png";
import muscleAvatarImage from "../assets/avatars/muscle-companion.png";
import type {
  HardwareProfile,
  PrivateFastModel,
  PrivateFastStatus,
  RunnableTiers,
  Tier,
  TierAssignment
} from "../lib/desktopBridge";
import type { CompanionAvatar } from "../lib/settingsStore";

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
  companionAvatar: CompanionAvatar;
  companionEnabled: boolean;
  onTierChange: (tier: Tier) => void;
  onModeChange: (mode: InputMode) => void;
  onToggleDictation: () => void;
  onLiveTextChange: (value: string) => void;
  onCopyRaw: () => void;
};

const TIER_META: Record<Tier, { name: string }> = {
  fast: { name: "Fast" },
  medium: { name: "Medium" },
  slow: { name: "Slow" }
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
  companionAvatar,
  companionEnabled,
  onTierChange,
  onModeChange,
  onToggleDictation,
  onLiveTextChange
}: DictationWorkbenchProps) {
  const activeMode = modeTemplates.find((mode) => mode.inputMode === selectedMode) ?? modeTemplates[0]!;
  const wordCount = estimateWordCount(liveText, language);
  const accel = hardwareProfile?.accelerators?.[0] ?? "CPU";
  const modelLabel = selectedModel?.label ?? privateFastStatus.modelName;

  const availableTiers: Array<[Tier, TierAssignment]> = (["fast", "medium", "slow"] as const)
    .map((id) => [id, runnableTiers[id]] as [Tier, TierAssignment | null])
    .filter((pair): pair is [Tier, TierAssignment] => pair[1] !== null);

  return (
    <section className="dictation-workbench" aria-label="Local dictation workbench">
      <div className="signal-deck">
        <div className="suggestion-chips" aria-label="Quick tips">
          <span className="suggestion-chip"><span className="key">⌥Space</span>Hold and speak</span>
          <span className="suggestion-chip"><span className="key">⌥⇧V</span>Paste last transcript</span>
          <span className="suggestion-chip">Resume from history…</span>
        </div>

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
          <button
            type="button"
            className="capture-orbit"
            onClick={onToggleDictation}
            aria-label={isDictating ? "Stop dictation" : "Start dictation"}
          >
            <Mic />
          </button>

          {liveText ? (
            <textarea
              value={liveText}
              onChange={(event) => onLiveTextChange(event.target.value)}
              placeholder="Press your dictation hotkey, or tap the mic."
              aria-label="Live dictation text"
            />
          ) : (
            <div className="capture-hint">
              Tap the mic, or press <kbd>⌥</kbd><kbd>Space</kbd>.
            </div>
          )}

          {availableTiers.length > 0 && (
            <div className="tier-selector" role="radiogroup" aria-label="Engine tier">
              {availableTiers.map(([id]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selectedTier === id}
                  className={`tier-button ${selectedTier === id ? "is-selected" : ""}`}
                  onClick={() => onTierChange(id)}
                >
                  <span className="name">{TIER_META[id].name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="workbench-footer">
        <div className="meta-chips">
          <span className="meta-chip"><span className="dot" />{privateFastStatus.ready ? "Engine ready" : "Engine setup needed"}</span>
          <span className="meta-chip">⚡ {accel}</span>
          <span className="meta-chip">{modelLabel}</span>
        </div>
        <span>
          {wordCount} words · {hotkeyStatus}
          {pasteStatus ? ` · ${pasteStatus}` : ""}
        </span>
      </div>

      {companionEnabled && (
        <CompanionPreview avatar={companionAvatar} isDictating={isDictating} />
      )}
    </section>
  );
}

function CompanionPreview({ avatar, isDictating }: { avatar: CompanionAvatar; isDictating: boolean }) {
  return (
    <div className="companion-preview" aria-hidden="true">
      <div className="avatar">
        <AvatarGlyph avatar={avatar} />
      </div>
      <div>
        <div className="label">{isDictating ? "Recording" : "Standing by"}</div>
        <div className="duration">⌥+Space</div>
      </div>
      <button
        type="button"
        title="Hide preview"
        aria-label="Hide preview"
        style={{
          marginLeft: 4,
          width: 18,
          height: 18,
          borderRadius: 999,
          background: "transparent",
          border: 0,
          color: "var(--faint)",
          display: "grid",
          placeItems: "center",
          opacity: 0.5
        }}
        onClick={(event) => {
          event.currentTarget.parentElement?.remove();
        }}
      >
        <XIcon size={11} />
      </button>
    </div>
  );
}

function AvatarGlyph({ avatar }: { avatar: CompanionAvatar }) {
  if (avatar === "cat") {
    return (
      <svg viewBox="0 0 96 96" role="img" aria-label="Cartoon cat">
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
  if (avatar === "trump") return <img src={trumpAvatarImage} alt="Cartoon Trump" draggable={false} />;
  if (avatar === "bikini") return <img src={bikiniAvatarImage} alt="Bikini companion" draggable={false} />;
  if (avatar === "muscle") return <img src={muscleAvatarImage} alt="Muscle companion" draggable={false} />;
  return (
    <svg viewBox="0 0 96 96" role="img" aria-label="Cartoon dog">
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
```

- [ ] **Step 2: Delete TierSelector and its test**

```bash
rm apps/desktop/src/components/TierSelector.tsx
rm apps/desktop/tests/tierSelector.test.tsx
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/components/DictationWorkbench.tsx
git rm apps/desktop/src/components/TierSelector.tsx
git rm apps/desktop/tests/tierSelector.test.tsx
git commit -m "$(cat <<'EOF'
feat(desktop): inline tier chips + suggestion row + companion preview

DictationWorkbench gets the Stitch-style layout: suggestion chips row
(static hotkey hints), M3 segmented mode pills, capture stage with the
mic FAB + inline tier chip group + conditional textarea, footer with
3 meta-chips + session/words. New bottom-right CompanionPreview card
mirrors Stitch's transcript widget. Adds companionAvatar +
companionEnabled props from App.tsx.

TierSelector.tsx and its vitest are deleted — tier chips are inlined
in the capture stage; the component file was no longer pulling its
weight as a separate unit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Update `App.tsx` heading block + sidebar mascot

**Files:**
- Modify: `apps/desktop/src/App.tsx`

- [ ] **Step 1: Read current App.tsx to find the topbar JSX**

```bash
grep -n "eyebrow\|viewTitle\|<aside className=\"sidebar\"\|brand-block\|privacy-chip\|status-banner" apps/desktop/src/App.tsx
```

Note the line numbers; you'll edit those locations below.

- [ ] **Step 2: Update imports**

Find the imports at the top of App.tsx. Locate the existing icon imports from lucide-react and the desktopBridge imports. Add `Headphones` if not already imported (for the sidebar mascot fallback). Also ensure these are imported from `./components/DictationWorkbench`:

```typescript
import { DictationWorkbench } from "./components/DictationWorkbench";
```

(Already imported — verify it's there.)

Remove the import of `TierSelector` if present (the component is deleted).

- [ ] **Step 3: Replace the topbar JSX**

In the JSX block that renders the main shell (after `if (!onboardingCompleted)`), find this section:

```tsx
        <header className="topbar">
          <div>
            <p className="eyebrow">{view}</p>
            <h1>{viewTitle(view)}</h1>
          </div>
          <div className="toolbar">
            <label className="select-control">
              <Languages size={16} />
              <select value={language} onChange={(event) => setLanguage(event.target.value as SupportedLanguage)}>
                {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>
```

Replace it with:

```tsx
        <header className="topbar">
          {view === "dictation" ? (
            <div className="heading-block">
              <div className="title-row">
                <h1>Private Dictation.</h1>
                <span className="beta-chip">BETA</span>
              </div>
              <p className="promise">
                Audio, transcripts, dictionary, snippets — <b>everything stays on this device</b>. No cloud round-trip, no API keys, no account required.
              </p>
            </div>
          ) : (
            <div className="heading-block">
              <div className="title-row">
                <h1>{viewTitle(view)}</h1>
              </div>
            </div>
          )}
          <div className="toolbar">
            <label className="select-control">
              <select value={language} onChange={(event) => setLanguage(event.target.value as SupportedLanguage)}>
                {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>
```

This drops the `<Languages>` icon (the CSS adds a `🌐` via `::before`) and removes the eyebrow `<p>`. The label "Speaking in · " is injected by the CSS rule on `.toolbar .select-control::after`.

- [ ] **Step 4: Replace the sidebar JSX**

Find the existing sidebar JSX:

```tsx
      <aside className="sidebar" aria-label="Primary">
        <div className="brand-block">
          <div className="brand-mark">
            <Mic2 size={22} />
          </div>
          <div>
            <strong>Dictivo</strong>
            <span>Local AI dictation</span>
          </div>
        </div>

        <nav className="nav-list">
          <NavButton active={view === "dictation"} label="Dictation" icon={<TerminalSquare size={18} />} onClick={() => setView("dictation")} />
          <NavButton active={view === "history"} label="History" icon={<History size={18} />} onClick={() => setView("history")} />
          <NavButton active={view === "dictionary"} label="Dictionary" icon={<BookOpenText size={18} />} onClick={() => setView("dictionary")} />
          <NavButton active={view === "settings"} label="Settings" icon={<Settings size={18} />} onClick={() => setView("settings")} />
        </nav>

        <div className="privacy-chip">
          <span className="status-dot" />
          <span>Local-only</span>
        </div>
      </aside>
```

Replace with:

```tsx
      <aside className="sidebar" aria-label="Primary">
        <div className="brand-mark">D</div>

        <nav className="nav-list">
          <NavButton active={view === "dictation"} label="Dictation" icon={<TerminalSquare size={18} />} onClick={() => setView("dictation")} />
          <NavButton active={view === "history"} label="History" icon={<History size={18} />} onClick={() => setView("history")} />
          <NavButton active={view === "dictionary"} label="Dictionary" icon={<BookOpenText size={18} />} onClick={() => setView("dictionary")} />
          <NavButton active={view === "settings"} label="Settings" icon={<Settings size={18} />} onClick={() => setView("settings")} />
        </nav>

        <SidebarMascot avatar={companionAvatar} />
      </aside>
```

- [ ] **Step 5: Update `NavButton` to render icon-only with title attribute**

Find the existing `NavButton` definition near the bottom of `App.tsx`:

```tsx
function NavButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button className={`nav-button ${active ? "is-active" : ""}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
```

Replace with:

```tsx
function NavButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`nav-button ${active ? "is-active" : ""}`}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );
}
```

- [ ] **Step 6: Add the `SidebarMascot` helper**

Append near the other helper functions at the bottom of `App.tsx`:

```tsx
function SidebarMascot({ avatar }: { avatar: CompanionAvatar }) {
  return (
    <div className="sidebar-mascot" aria-hidden="true">
      <AvatarPreview avatar={avatar} />
    </div>
  );
}

function AvatarPreview({ avatar }: { avatar: CompanionAvatar }) {
  if (avatar === "cat") {
    return (
      <svg viewBox="0 0 96 96" role="img" aria-label="Cartoon cat">
        <path d="M24 35 18 13l22 14m32 8 6-22-22 14" fill="#5a6970" />
        <circle cx="48" cy="52" r="31" fill="#7f9299" />
        <circle cx="36" cy="48" r="4" fill="#0b1112" />
        <circle cx="60" cy="48" r="4" fill="#0b1112" />
        <path d="M43 56h10l-5 6z" fill="#ffb7c5" />
      </svg>
    );
  }
  if (avatar === "trump") return <img src="/src/assets/avatars/trump-companion.png" alt="" draggable={false} />;
  if (avatar === "bikini") return <img src="/src/assets/avatars/bikini-companion.png" alt="" draggable={false} />;
  if (avatar === "muscle") return <img src="/src/assets/avatars/muscle-companion.png" alt="" draggable={false} />;
  return (
    <svg viewBox="0 0 96 96" role="img" aria-label="Cartoon dog">
      <circle cx="48" cy="52" r="31" fill="#d89954" />
      <circle cx="36" cy="48" r="4" fill="#1a1210" />
      <circle cx="60" cy="48" r="4" fill="#1a1210" />
      <path d="M42 59c4 3 8 3 12 0" fill="none" stroke="#1a1210" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
```

- [ ] **Step 7: Update the import line for `Mic2` if it becomes unused**

Run: `grep -n "Mic2" apps/desktop/src/App.tsx`. If `Mic2` is no longer referenced (the sidebar mark is now plain text "D" instead of the mic icon), remove `Mic2` from the lucide-react import. If still used elsewhere (e.g., in the brand block before fully replaced), leave it.

Similarly, `Languages` (for the lang chip) is no longer used — drop it from the import.

- [ ] **Step 8: Pass `companionAvatar` + `companionEnabled` to `<DictationWorkbench>`**

Find the existing JSX call to `<DictationWorkbench .../>` and add the two new props:

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
            companionAvatar={companionAvatar}
            companionEnabled={companionEnabled}
            onTierChange={handleTierChange}
            onModeChange={setSelectedMode}
            onToggleDictation={toggleDictation}
            onLiveTextChange={setLiveText}
            onCopyRaw={() => void navigator.clipboard.writeText(rawText)}
          />
```

- [ ] **Step 9: Verify typecheck**

Run: `npm run typecheck -w @dictivo/desktop 2>&1 | tail -5`
Expected: 0 errors. If `Mic2` / `Languages` removal caused unused-import warnings, ensure those imports are dropped.

- [ ] **Step 10: Commit**

```bash
git add apps/desktop/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(desktop): heading block + sidebar mascot in App.tsx

Replaces the old eyebrow + viewTitle topbar with the Stitch
heading-block (Private Dictation. + BETA chip + promise sub-line) on
the Dictation view only. Other views keep their plain h1. Sidebar
becomes icon-only with a plain "D" brand-mark and a small
SidebarMascot rendering the active companion avatar at the bottom.
Drops the redundant "Local AI dictation" subtitle and "privacy-chip"
status pill — privacy now lives in the heading-block promise.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Update unit + e2e tests to match new DOM

**Files:**
- Modify: `apps/desktop/tests/componentsStatic.test.tsx`
- Modify: `apps/desktop/tests/wireframeVisual.test.ts`
- Modify: `apps/desktop/e2e/app.spec.ts`

- [ ] **Step 1: Inspect failing assertions in `componentsStatic.test.tsx`**

```bash
npm run test -w @dictivo/desktop -- tests/componentsStatic.test.tsx 2>&1 | tail -30
```

The test currently asserts strings like "Dictation Workbench", "Local Dictation", "Local AI dictation" that are gone. It also passes the old DictationWorkbench prop shape (without `companionAvatar` / `companionEnabled`).

- [ ] **Step 2: Patch `componentsStatic.test.tsx`**

Open the file. Find the shared props block used for `<DictationWorkbench>` and add the two new required props:

```tsx
const sharedProps = {
  // ...existing props...
  companionAvatar: "dog" as const,
  companionEnabled: true,
};
```

Find any assertion strings that no longer exist in the DOM:
- `Dictation Workbench` → `Private Dictation.`
- `Local Dictation` → remove that assertion entirely (the eyebrow is gone)
- `Local AI dictation` → remove (sidebar subtitle deleted)
- `Local-only` (privacy-chip text) → remove (chip deleted)

Add a positive assertion for the new heading:

```tsx
expect(screen.getByText("Private Dictation.")).toBeTruthy();
expect(screen.getByText("BETA")).toBeTruthy();
```

- [ ] **Step 3: Patch `wireframeVisual.test.ts`**

```bash
npm run test -w @dictivo/desktop -- tests/wireframeVisual.test.ts 2>&1 | tail -30
```

This test loads `app.css` and asserts CSS variables. Find the assertions on the Calm Native tokens (`--accent: #007aff`, `--bg: #f4f5f7`, etc.) and replace with the new Stitch tokens:

```tsx
it("defines the Stitch design tokens", () => {
  const css = readFileSync(resolve(__dirname, "../src/styles/app.css"), "utf8");
  expect(css).toContain("--canvas: #0a0a0c");
  expect(css).toContain("--accent: #a78bfa");
  expect(css).toContain("--accent-text: #c4b5fd");
  expect(css).toContain("font-family: \"Google Sans\"");
  expect(css).toContain("radial-gradient(\n    circle,");
});
```

Replace the existing tokens-related test cases with this single test (or a couple of focused ones). Remove any assertion on `--bg: #f4f5f7`, `prefers-color-scheme: dark` block markers, `--accent: #007aff`, or other Calm Native artifacts.

- [ ] **Step 4: Patch `apps/desktop/e2e/app.spec.ts`**

The e2e selectors target `heading: "Dictation"`. The new H1 is "Private Dictation." which still contains "Dictation". Most selectors will still match. The one to verify is the explicit text match `"Dictation"` heading — if it uses `getByRole("heading", { name: "Dictation" })` change to `getByRole("heading", { name: /Dictation\./i })` or `getByText("Private Dictation.")`.

Run: `grep -n 'Dictation\|"Dictation"\|"Local-only"\|"Local AI"' apps/desktop/e2e/app.spec.ts`

For each occurrence:
- `"Dictation"` exact-text expectations on the heading → change to a regex `/Private Dictation\./`
- `"Local-only"` / `"Local AI"` references → delete those assertions

- [ ] **Step 5: Run all unit + e2e tests**

```bash
npm run test -w @dictivo/desktop 2>&1 | tail -10
npm run e2e -w @dictivo/desktop 2>&1 | tail -10
```

Expected: vitest all green, playwright all green.

If a specific test still fails after the patches, address it inline — the goal is that the redesign doesn't regress test coverage.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/tests/componentsStatic.test.tsx apps/desktop/tests/wireframeVisual.test.ts apps/desktop/e2e/app.spec.ts
git commit -m "$(cat <<'EOF'
test(desktop): align unit + e2e tests with Stitch-style DOM

componentsStatic now asserts "Private Dictation." / "BETA" and feeds
the new companionAvatar + companionEnabled props. wireframeVisual
swaps the Calm Native token assertions for the Stitch tokens
(--canvas #0a0a0c, --accent #a78bfa, Google Sans). e2e selector on
the heading is loosened to match "Private Dictation." while keeping
the "Dictation" navigation button assertion intact.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Full sanity build + Tauri rebuild + reinstall

**Files:** none modified; verification only.

- [ ] **Step 1: Workspace-wide test sweep**

```bash
npm run typecheck -w @dictivo/desktop 2>&1 | tail -5
npm run test 2>&1 | grep -E "Test Files|Tests" | head -6
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml 2>&1 | grep "test result" | head -4
```

Expected: typecheck clean, all TS suites pass, Rust 23 passed.

- [ ] **Step 2: Tauri release build**

```bash
npm run tauri:build -w @dictivo/desktop 2>&1 | tail -10
```

Expected: `Finished release profile`, `.app` + `.dmg` bundled.

- [ ] **Step 3: Replace the installed app**

```bash
osascript -e 'tell application "Dictivo" to quit' 2>/dev/null || true
sleep 1
rm -rf /Applications/Dictivo.app
cp -R apps/desktop/src-tauri/target/release/bundle/macos/Dictivo.app /Applications/
xattr -dr com.apple.quarantine /Applications/Dictivo.app 2>/dev/null || true
ls -ld /Applications/Dictivo.app
```

- [ ] **Step 4: Clean up stray build artifacts so Spotlight doesn't index a second .app**

```bash
rm -rf apps/desktop/src-tauri/target/release/bundle/macos/Dictivo.app
touch apps/desktop/src-tauri/target/.metadata_never_index
```

- [ ] **Step 5: Commit any drift + push**

```bash
git status --short
# If anything new appears, add+commit it. Otherwise just push.
git push origin main 2>&1 | tail -5
```

---

## Self-Review

After the plan is written, run these inline checks:

**1. Spec coverage** — every spec § maps to a task:
- §1 Goals / non-goals — covered by overall scope
- §2 Design Tokens — Task 2 (app.css rewrite contains every token)
- §3.1 Shell — Task 4 (sidebar + workspace structure)
- §3.2 Sidebar — Task 4 (brand-mark + nav buttons + SidebarMascot)
- §3.3 Heading block — Task 4 (Private Dictation. + BETA + promise)
- §3.4 Lang chip — Task 2 (CSS `::after` injects "Speaking in · ") + Task 4 (drops the Languages icon import)
- §3.5 Suggestion chips — Task 3 (in DictationWorkbench)
- §3.6 Mode chips — Task 3 + Task 2 CSS
- §3.7 Capture stage — Task 3 + Task 2 CSS
- §3.8 Tier selector — Task 3 inline + Task 2 CSS
- §3.9 Footer status — Task 3 + Task 2 CSS
- §3.10 Floating Companion card — Task 3 (CompanionPreview)
- §4 Copy — Task 3 + Task 4 (hardcoded strings)
- §5 File list — explicit at top of plan
- §6 Risks — addressed inline (clamp for H1 overflow, font preload, redundant Tier component deleted)
- §7 Definition of Done — Task 6

**2. Placeholder scan** — search for `TBD` / `TODO` / `implement later` / `fill in details` — none expected.

**3. Type consistency** — `companionAvatar: CompanionAvatar`, `companionEnabled: boolean` are the exact new prop names used in both DictationWorkbench (Task 3) and App.tsx (Task 4). `AvatarGlyph` (in DictationWorkbench) and `AvatarPreview` (in App.tsx) are intentionally separate helper functions — both render the avatar set but in different containers; keeping them as siblings rather than a shared util is acceptable for this redesign's scope.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-12-stitch-style-redesign.md`.**

Per user direction ("不需要问我 直到做到结束为止"), proceeding directly into Subagent-Driven execution. Implementer subagents will be dispatched task-by-task with spec + quality reviews between each.
