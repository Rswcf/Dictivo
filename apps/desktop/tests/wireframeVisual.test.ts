import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("src/styles/app.css", "utf8");

describe("wireframe visual system", () => {
  it("uses a hand-drawn monochrome foundation", () => {
    expect(css).toContain("Comic Sans MS");
    expect(css).toContain("--paper");
    expect(css).toContain("--ink");
    expect(css).toContain("repeating-linear-gradient");
    expect(css).toContain("dashed");
    expect(css).toContain("box-shadow: var(--shadow");
  });

  it("keeps the old neon dark theme from returning", () => {
    expect(css).not.toContain("#94ffb5");
    expect(css).not.toContain("#d7ff67");
    expect(css).not.toContain("#76e7d8");
    expect(css).not.toContain("#080a0a");
    expect(css).not.toContain("backdrop-filter");
  });

  it("covers responsive breakpoints and companion styling in the same visual language", () => {
    expect(css).toContain("@media (max-width: 1040px)");
    expect(css).toContain("@media (max-width: 720px)");
    expect(css).toContain(".companion-bubble");
    expect(css).toContain("filter: grayscale(1)");
  });
});
