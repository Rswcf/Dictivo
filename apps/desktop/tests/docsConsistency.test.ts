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
    expect(readme).toContain("Text cleanup");
  });

  it("documents the current Windows parity boundary in user-facing docs", () => {
    const expectations = [
      {
        path: "../../README.md",
        snippets: ["Windows validation builds", "feature-aligned with macOS"]
      },
      {
        path: "../../docs/README.zh-CN.md",
        snippets: ["Windows 验证构建", "功能与 macOS 对齐"]
      },
      {
        path: "../../docs/README.ja.md",
        snippets: ["Windows 検証ビルド", "macOS と機能を揃え"]
      },
      {
        path: "../../docs/README.es.md",
        snippets: ["builds de validación para Windows", "paridad funcional con macOS"]
      }
    ];

    for (const { path, snippets } of expectations) {
      const content = readFileSync(path, "utf8");
      for (const snippet of snippets) {
        expect(content, `${path} should document ${snippet}`).toContain(snippet);
      }
    }
  });

  it("documents automatic language detection instead of a Speaking in selector", () => {
    const expectations = [
      { path: "../../README.md", snippets: ["Auto language detection", "output stays in the spoken language"] },
      { path: "../../docs/README.zh-CN.md", snippets: ["默认自动检测输入语言", "不再要求用户提前选择"] },
      { path: "../../docs/README.ja.md", snippets: ["入力言語を自動検出", "事前に \"Speaking in\" を選ぶ必要はありません"] },
      { path: "../../docs/README.es.md", snippets: ["detecta automáticamente el idioma", "ya no hace falta elegir \"Speaking in\""] }
    ];

    for (const { path, snippets } of expectations) {
      const content = readFileSync(path, "utf8");
      expect(content, `${path} should not advertise the old Speaking in selector`).not.toContain("Speaking in ·");
      for (const snippet of snippets) {
        expect(content, `${path} should document ${snippet}`).toContain(snippet);
      }
    }
  });

  it("keeps the Windows parity test plan tied to the current feature set", () => {
    const plan = readFileSync("../../docs/windows-parity-test-plan.md", "utf8");
    const nativePlan = readFileSync("../../docs/native-manual-test-plan.md", "utf8");
    const windowsSmokeScript = readFileSync("../../scripts/windows-parity-smoke.ps1", "utf8");
    const requiredSnippets = [
      "Dictivo-Windows-x64-installers",
      "windows-parity-smoke.ps1",
      "WIN-PARITY-003",
      "WIN-PARITY-004",
      "WIN-PARITY-006",
      "WIN-PARITY-007",
      "WIN-PARITY-008",
      "WIN-PARITY-012",
      "WIN-PARITY-014",
      "WIN-PARITY-020",
      "Cloud Fast",
      "Private Local",
      "Paste Last",
      "CI installer + launch smoke",
      "Do not mark Windows parity complete from CI alone"
    ];

    for (const snippet of requiredSnippets) {
      expect(plan, `windows parity plan should include ${snippet}`).toContain(snippet);
    }
    expect(nativePlan).toContain("windows-parity-test-plan.md");
    expect(windowsSmokeScript).toContain("Dictivo_${version}_x64-setup.exe");
    expect(windowsSmokeScript).toContain("Installed Dictivo.exe ProductVersion");
    expect(windowsSmokeScript).toContain("Start-Process -FilePath $installedExe.FullName -PassThru");
    expect(windowsSmokeScript).toContain("Continue with WIN-PARITY-002 through WIN-PARITY-020");
  });
});
