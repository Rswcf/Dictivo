import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanGeneratedOutput } from "../../../scripts/prepare-private-fast-engine.mjs";
import { firstModelInDir, validateInstalledAppMetadata, validateSmokeTranscript } from "../../../scripts/smoke-private-fast.mjs";

const workflow = readFileSync("../../.github/workflows/build-desktop.yml", "utf8").replace(/\r\n/g, "\n");
const privateFastPrepareScript = readFileSync("../../scripts/prepare-private-fast-engine.mjs", "utf8");
const tauriLib = readFileSync("src-tauri/src/lib.rs", "utf8");
const privateFastNative = readFileSync("src-tauri/src/private_fast.rs", "utf8");

describe("desktop release workflow", () => {
  it("keeps GitHub token permissions read-only for desktop release builds", () => {
    expect(workflow).toContain("permissions:\n  contents: read\n");
    expect(workflow).not.toContain("contents: write");
    expect(workflow).not.toContain("packages: write");
    expect(workflow).not.toContain("id-token: write");
  });

  it("uses current Node 24-compatible GitHub Actions and runner labels", () => {
    expect(workflow).toContain("actions/checkout@v6");
    expect(workflow).toContain("actions/setup-node@v6");
    expect(workflow).toContain("actions/upload-artifact@v7");
    expect(workflow).toContain("node-version: 24");
    expect(workflow).not.toContain("node-version: 20");
    expect(workflow).not.toContain("FORCE_JAVASCRIPT_ACTIONS_TO_NODE24");
    expect(workflow).not.toContain("windows-latest");
  });

  it("keeps the macOS universal app release target in the desktop build matrix", () => {
    const macosMatrix = workflow.slice(
      workflow.indexOf("- label: macOS universal"),
      workflow.indexOf("- label: Windows x64")
    );

    expect(macosMatrix).toContain("os: macos-latest");
    expect(macosMatrix).toContain("rust_targets: x86_64-apple-darwin aarch64-apple-darwin");
    expect(macosMatrix).toContain("tauri_target: universal-apple-darwin");
    expect(macosMatrix).toContain("tauri_bundles: app");
    expect(macosMatrix).toContain("artifact_name: Dictivo-macOS-universal");
    expect(macosMatrix).toContain("bundle_path: apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle");
  });

  it("keeps the Windows MSI release target in the desktop build matrix", () => {
    const windowsMatrix = workflow.slice(
      workflow.indexOf("- label: Windows x64"),
      workflow.indexOf("steps:")
    );

    expect(windowsMatrix).toContain("os: windows-2025-vs2026");
    expect(windowsMatrix).toContain("rust_targets: x86_64-pc-windows-msvc");
    expect(windowsMatrix).toContain("tauri_target: x86_64-pc-windows-msvc");
    expect(windowsMatrix).toContain("tauri_bundles: msi");
    expect(windowsMatrix).toContain("artifact_name: Dictivo-Windows-x64");
    expect(windowsMatrix).toContain("bundle_path: apps/desktop/src-tauri/target/x86_64-pc-windows-msvc/release/bundle");
  });

  it("runs release gates before building desktop artifacts", () => {
    const requiredSteps = [
      "- name: Lint",
      "- name: Typecheck",
      "- name: Test",
      "- name: Dependency audit",
      "- name: Rust format check",
      "- name: Rust unit tests",
      "- name: Install Playwright browser",
      "- name: E2E",
      "- name: Whitespace check",
      "- name: Prepare Private Fast engine",
      "- name: Build Tauri bundle",
      "- name: Upload desktop artifact"
    ];

    const indexes = requiredSteps.map((step) => workflow.indexOf(step));
    expect(indexes.every((index) => index >= 0)).toBe(true);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
    expect(workflow).toContain("npm audit --audit-level=moderate");
    expect(workflow).toContain("cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check");
    expect(workflow).toContain("git diff --check");
  });

  it("keeps the interactive global hotkey probe opt-in for manual workflow runs", () => {
    expect(workflow).toContain("run_global_hotkey_probe:");
    expect(workflow).toContain('description: "Run the interactive global hotkey probe on the runner"');
    expect(workflow).toContain("type: boolean");
    expect(workflow).toContain("- name: Global hotkey probe");
    expect(workflow).toContain("if: ${{ github.event_name == 'workflow_dispatch' && inputs.run_global_hotkey_probe }}");
    expect(workflow).toContain("cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test global_hotkey_probe -- --ignored --nocapture");
  });

  it("cleans stale generated Private Fast artifacts before preparing a platform bundle", () => {
    expect(privateFastPrepareScript).toContain("cleanGeneratedOutput(outputDir)");
    expect(privateFastPrepareScript).toContain('entry === "manifest.json"');
    expect(privateFastPrepareScript).toContain('lowerEntry === "whisper-cli"');
    expect(privateFastPrepareScript).toContain('lowerEntry === "whisper-cli.exe"');
    expect(privateFastPrepareScript).toContain('lowerEntry.endsWith(".dll")');
    expect(privateFastPrepareScript).toContain("rmSync(join(directory, entry), { force: true })");
  });

  it("removes stale generated Private Fast files without deleting unrelated resources", () => {
    const directory = mkdtempSync(join(tmpdir(), "dictivo-private-fast-"));

    try {
      const generatedFiles = ["manifest.json", "whisper-cli", "whisper-cli.exe", "ggml.dll", "GGML-CUDA.DLL"];
      const preservedFiles = ["README.md", "benchmark-5s.wav", "notes.txt"];

      for (const file of [...generatedFiles, ...preservedFiles]) {
        writeFileSync(join(directory, file), file);
      }

      cleanGeneratedOutput(directory);

      for (const file of generatedFiles) {
        expect(existsSync(join(directory, file))).toBe(false);
      }

      for (const file of preservedFiles) {
        expect(existsSync(join(directory, file))).toBe(true);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps Windows child processes routed through hidden-window command helpers", () => {
    expect(tauriLib).toContain("cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW");
    expect(tauriLib).toContain("let status = quiet_command(program)");
    expect(tauriLib).toContain('let status = quiet_command("powershell")');

    expect(privateFastNative).toContain("cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW");
    expect(privateFastNative).toContain("let mut command = quiet_command(&binary_path)");
    expect(privateFastNative).toContain("let mut child = quiet_command(&binary_path)");
    expect(privateFastNative).toContain('quiet_command("powershell")');
  });

  it("validates Private Fast smoke transcript and installed app metadata contracts", () => {
    expect(() => validateSmokeTranscript("The quick brown fox jumps over the lazy dog. Local dictation works well today.")).not.toThrow();
    expect(() => validateSmokeTranscript("The quick brown fox jumps only.")).toThrow("Unexpected smoke transcript");
    expect(() => validateSmokeTranscript("The quick brown fox. Local dictation works.", "open: failed to open /dev/null.txt")).toThrow(
      "output-file error"
    );

    const validMetadata = {
      expectedVersion: "0.2.0",
      shortVersion: "0.2.0",
      bundleVersion: "0.2.0",
      microphoneUsage: "Dictivo needs microphone access for local dictation.",
      appleEventsUsage: "Dictivo needs automation permission to paste into the active app."
    };

    expect(() => validateInstalledAppMetadata(validMetadata)).not.toThrow();
    expect(() => validateInstalledAppMetadata({ ...validMetadata, bundleVersion: "0.1.0" })).toThrow("version mismatch");
    expect(() => validateInstalledAppMetadata({ ...validMetadata, microphoneUsage: "Record locally." })).toThrow("NSMicrophoneUsageDescription");
    expect(() => validateInstalledAppMetadata({ ...validMetadata, appleEventsUsage: "Control the active app." })).toThrow("NSAppleEventsUsageDescription");
  });

  it("prefers the expected Private Fast smoke model when scanning model directories", () => {
    const directory = mkdtempSync(join(tmpdir(), "dictivo-smoke-models-"));
    const modelsDir = join(directory, "models");

    try {
      mkdirSync(modelsDir);
      writeFileSync(join(modelsDir, "ggml-large-v3-turbo.bin"), "large");
      writeFileSync(join(modelsDir, "ggml-tiny.bin"), "tiny");
      expect(firstModelInDir(modelsDir)).toBe(join(modelsDir, "ggml-tiny.bin"));

      writeFileSync(join(modelsDir, "ggml-base.bin"), "base");
      expect(firstModelInDir(modelsDir)).toBe(join(modelsDir, "ggml-base.bin"));

      writeFileSync(join(modelsDir, "ggml-small.bin"), "small");
      expect(firstModelInDir(modelsDir)).toBe(join(modelsDir, "ggml-small.bin"));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
