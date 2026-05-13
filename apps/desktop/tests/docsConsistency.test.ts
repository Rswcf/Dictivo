import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const userFacingDocs = [
  "../../README.md",
  "../../docs/README.zh-CN.md",
  "../../docs/README.ja.md",
  "../../docs/README.es.md"
];

describe("user-facing documentation", () => {
  it("does not advertise the removed primary mode selector", () => {
    const removedModeClaims = [
      /4 polish modes/i,
      /Message\s*\/\s*Email\s*\/\s*Prompt modes/i,
      /Message,\s*Email,\s*Raw/i,
      /Message、Email、Raw/i,
      /Elige Message,\s*Email,\s*Raw/i
    ];

    for (const path of userFacingDocs) {
      const content = readFileSync(path, "utf8");
      for (const claim of removedModeClaims) {
        expect(content, `${path} should not contain ${claim}`).not.toMatch(claim);
      }
    }
  });

  it("documents the current default hotkey and local processing controls", () => {
    const readme = readFileSync("../../README.md", "utf8");
    expect(readme).toContain("CommandOrControl+Shift+Space");
    expect(readme).toContain("CommandOrControl+Shift+V");
    expect(readme).not.toContain("⌥+Space");
    expect(readme).toContain("Smart local polish");
    expect(readme).toContain("Processing toggles");
  });

  it("documents both Windows installer tracks", () => {
    const readme = readFileSync("../../README.md", "utf8");
    expect(readme).toContain(".exe current-user installer");
    expect(readme).toContain(".msi");
    expect(readme).toContain("managed deployment");
  });
});
