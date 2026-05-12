import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("src/styles/app.css", "utf8");

describe("wireframe visual system", () => {
  it("uses a high-tech private compute foundation", () => {
    expect(css).toContain("color-scheme: dark");
    expect(css).toContain("--cyan");
    expect(css).toContain("--lime");
    expect(css).toContain("--amber");
    expect(css).toContain("--panel");
    expect(css).toContain("backdrop-filter");
    expect(css).toContain("mix-blend-mode: screen");
  });

  it("keeps the hand-drawn notebook theme from returning", () => {
    expect(css).not.toContain("Comic Sans MS");
    expect(css).not.toContain("Marker Felt");
    expect(css).not.toContain("#f3f2ea");
    expect(css).not.toContain("--paper");
    expect(css).not.toContain("5px 5px 0 #111111");
  });

  it("renders signal-grid motion and durable panel primitives", () => {
    expect(css).toContain("repeating-linear-gradient");
    expect(css).toContain("box-shadow: var(--shadow");
    expect(css).toContain(".capture-orbit");
    expect(css).toContain(".level-bars");
    expect(css).toContain("@keyframes pulse");
  });

  it("covers responsive breakpoints and companion styling in the same visual language", () => {
    expect(css).toContain("@media (max-width: 1040px)");
    expect(css).toContain("@media (max-width: 720px)");
    expect(css).toContain(".companion-bubble");
    expect(css).toContain("filter: saturate(1.08)");
  });
});
