import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("src/styles/app.css", "utf8");

describe("wireframe visual system", () => {
  it("uses Stitch design tokens", () => {
    expect(css).toContain("--canvas: #0a0a0c");
    expect(css).toContain("--accent: #a78bfa");
    expect(css).toContain("--accent-text: #c4b5fd");
    expect(css).toContain("--cyan-mono: #5eead4");
    expect(css).toContain("--radius");
    expect(css).toContain("-webkit-font-smoothing: antialiased");
  });

  it("loads Google Sans + JetBrains Mono families", () => {
    expect(css).toContain('"Google Sans"');
    expect(css).toContain('"Google Sans Text"');
    expect(css).toContain('"JetBrains Mono"');
  });

  it("keeps the hand-drawn notebook theme from returning", () => {
    expect(css).not.toContain("Comic Sans MS");
    expect(css).not.toContain("Marker Felt");
    expect(css).not.toContain("#f3f2ea");
    expect(css).not.toContain("--paper");
    expect(css).not.toContain("5px 5px 0 #111111");
  });

  it("renders capture stage and tier primitives", () => {
    expect(css).toContain(".capture-orbit");
    expect(css).toContain(".tier-button");
    expect(css).toContain(".tier-card");
    expect(css).toContain(".beta-chip");
    expect(css).toContain(".companion-preview");
  });

  it("paints a dot-grid texture on the workspace", () => {
    expect(css).toContain("background-image: radial-gradient(");
    expect(css).toContain("background-size: 24px 24px");
  });

  it("covers companion floating window + wizard styling", () => {
    expect(css).toContain(".companion-shell");
    expect(css).toContain(".wizard-card");
    expect(css).toContain(".wizard-shell");
  });
});
