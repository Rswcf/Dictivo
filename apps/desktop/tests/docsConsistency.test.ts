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

  it("documents both Windows installer tracks in user-facing docs", () => {
    const expectations = [
      {
        path: "../../README.md",
        snippets: [".exe current-user installer", ".msi", "managed deployment"]
      },
      {
        path: "../../docs/README.zh-CN.md",
        snippets: ["`.exe` 当前用户安装包", "`.msi`", "公司统一部署"]
      },
      {
        path: "../../docs/README.ja.md",
        snippets: ["`.exe` の現在ユーザー向けインストーラー", "`.msi`", "管理配布"]
      },
      {
        path: "../../docs/README.es.md",
        snippets: ["`.exe` para el usuario actual", "`.msi`", "despliegues administrados"]
      }
    ];

    for (const { path, snippets } of expectations) {
      const content = readFileSync(path, "utf8");
      for (const snippet of snippets) {
        expect(content, `${path} should document ${snippet}`).toContain(snippet);
      }
    }
  });
});
