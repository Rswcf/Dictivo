import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("src/styles/app.css", "utf8");

describe("wireframe visual system", () => {
  it("uses Calm Native design tokens", () => {
    expect(css).toContain("--bg:");
    expect(css).toContain("--surface:");
    expect(css).toContain("--ink:");
    expect(css).toContain("--accent:");
    expect(css).toContain("--accent-soft:");
    expect(css).toContain("--radius");
    expect(css).toContain("-webkit-font-smoothing: antialiased");
  });

  it("keeps the hand-drawn notebook theme from returning", () => {
    expect(css).not.toContain("Comic Sans MS");
    expect(css).not.toContain("Marker Felt");
    expect(css).not.toContain("#f3f2ea");
    expect(css).not.toContain("--paper");
    expect(css).not.toContain("5px 5px 0 #111111");
  });

  it("renders capture stage and tier primitives", () => {
    expect(css).toContain("box-shadow: var(--shadow");
    expect(css).toContain(".capture-orbit");
    expect(css).toContain(".tier-button");
    expect(css).toContain(".tier-card");
  });

  it("covers dark-mode overrides and companion styling", () => {
    expect(css).toContain("prefers-color-scheme: dark");
    expect(css).toContain(".companion-shell");
    expect(css).toContain(".wizard-card");
    expect(css).toContain(".wizard-shell");
  });
});
