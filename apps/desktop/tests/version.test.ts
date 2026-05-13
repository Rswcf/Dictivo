import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

type PackageJson = {
  version: string;
  dependencies?: Record<string, string>;
};

type PackageLock = {
  version: string;
  packages: Record<string, { version?: string; dependencies?: Record<string, string> }>;
};

type PrivateFastManifest = {
  whisperCppRef: string;
  binary: string;
  builtAt: string;
};

function readText(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function readJson<T>(path: string): T {
  return JSON.parse(readText(path)) as T;
}

describe("release version metadata", () => {
  it("keeps npm workspace versions and local dependency ranges in sync", () => {
    const rootPackage = readJson<PackageJson>("../../package.json");
    const desktopPackage = readJson<PackageJson>("package.json");
    const apiPackage = readJson<PackageJson>("../api/package.json");
    const sharedPackage = readJson<PackageJson>("../../packages/shared/package.json");
    const lockfile = readJson<PackageLock>("../../package-lock.json");

    expect(rootPackage.version).toMatch(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
    expect(desktopPackage.version).toBe(rootPackage.version);
    expect(apiPackage.version).toBe(rootPackage.version);
    expect(sharedPackage.version).toBe(rootPackage.version);
    expect(lockfile.version).toBe(rootPackage.version);
    expect(lockfile.packages[""].version).toBe(rootPackage.version);
    expect(lockfile.packages["apps/desktop"].version).toBe(rootPackage.version);
    expect(lockfile.packages["apps/api"].version).toBe(rootPackage.version);
    expect(lockfile.packages["packages/shared"].version).toBe(rootPackage.version);

    expect(desktopPackage.dependencies?.["@dictivo/shared"]).toBe(`^${rootPackage.version}`);
    expect(apiPackage.dependencies?.["@dictivo/shared"]).toBe(`^${rootPackage.version}`);
    expect(lockfile.packages["apps/desktop"].dependencies?.["@dictivo/shared"]).toBe(`^${rootPackage.version}`);
    expect(lockfile.packages["apps/api"].dependencies?.["@dictivo/shared"]).toBe(`^${rootPackage.version}`);
  });

  it("keeps Tauri, Cargo, and frontend build metadata aligned", () => {
    const rootPackage = readJson<PackageJson>("../../package.json");
    const tauriConfig = readJson<{ version: string }>("src-tauri/tauri.conf.json");
    const cargoToml = readText("src-tauri/Cargo.toml");
    const cargoLock = readText("src-tauri/Cargo.lock");
    const viteConfig = readText("vite.config.ts");

    const cargoVersion = cargoToml.match(/^version = "([^"]+)"/m)?.[1];
    const cargoLockVersion = cargoLock.match(/\[\[package\]\]\nname = "dictivo"\nversion = "([^"]+)"/)?.[1];

    expect(tauriConfig.version).toBe(rootPackage.version);
    expect(cargoVersion).toBe(rootPackage.version);
    expect(cargoLockVersion).toBe(rootPackage.version);
    expect(viteConfig).toContain("__DICTIVO_VERSION__");
    expect(viteConfig).toContain("./package.json");
  });

  it("keeps native app identity and companion window packaging contracts stable", () => {
    const tauriConfig = readJson<{
      productName: string;
      identifier: string;
      app: {
        windows: Array<{
          label: string;
          title?: string;
          width?: number;
          height?: number;
          minWidth?: number;
          minHeight?: number;
          resizable?: boolean;
          decorations?: boolean;
          transparent?: boolean;
          alwaysOnTop?: boolean;
          skipTaskbar?: boolean;
          visible?: boolean;
          focus?: boolean;
          shadow?: boolean;
        }>;
      };
      bundle: {
        category: string;
        resources: Record<string, string>;
      };
    }>("src-tauri/tauri.conf.json");
    const capability = readJson<{ windows: string[]; permissions: string[] }>("src-tauri/capabilities/default.json");

    expect(tauriConfig.productName).toBe("Dictivo");
    expect(tauriConfig.identifier).toBe("com.dictivo.desktop");
    expect(tauriConfig.bundle.category).toBe("Productivity");
    expect(tauriConfig.bundle.resources).toMatchObject({
      "resources/private-fast": "private-fast",
      "resources/benchmark-5s.wav": "benchmark-5s.wav"
    });

    const mainWindow = tauriConfig.app.windows.find((window) => window.label === "main");
    expect(mainWindow).toMatchObject({
      title: "Dictivo",
      width: 1240,
      height: 820,
      minWidth: 980,
      minHeight: 680,
      resizable: true
    });

    const companionWindow = tauriConfig.app.windows.find((window) => window.label === "companion");
    expect(companionWindow).toMatchObject({
      title: "Dictivo Companion",
      width: 360,
      height: 100,
      minWidth: 320,
      minHeight: 90,
      resizable: false,
      decorations: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      visible: false,
      focus: false,
      shadow: false
    });

    expect(capability.windows).toEqual(["main", "companion"]);
    expect(capability.permissions).toEqual([
      "core:default",
      "core:window:allow-hide",
      "core:window:allow-set-position",
      "core:window:allow-show",
      "core:window:allow-start-dragging",
      "global-shortcut:default",
      "global-shortcut:allow-is-registered",
      "global-shortcut:allow-register",
      "global-shortcut:allow-unregister"
    ]);
  });

  it("ships Private Fast resources in the format expected by the native bundle", () => {
    const binGitignore = readText("src-tauri/resources/private-fast/bin/.gitignore");
    const prepareScript = readText("../../scripts/prepare-private-fast-engine.mjs");
    const wav = readFileSync("src-tauri/resources/benchmark-5s.wav");
    const fmt = readWavFormat(wav);

    expect(binGitignore).toContain("*");
    expect(binGitignore).toContain("!.gitignore");
    expect(binGitignore).toContain("!.gitkeep");
    expect(prepareScript).toContain('join(outputDir, "manifest.json")');
    expect(prepareScript).toContain("whisperCppRef: whisperRef");
    expect(prepareScript).toContain('process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli"');
    expect(fmt).toEqual({
      audioFormat: 1,
      channels: 1,
      sampleRate: 16000,
      bitsPerSample: 16,
      hasDataChunk: true
    });

    if (existsSync("src-tauri/resources/private-fast/bin/manifest.json")) {
      const manifest = readJson<PrivateFastManifest>("src-tauri/resources/private-fast/bin/manifest.json");
      const binaryStat = statSync(`src-tauri/resources/private-fast/bin/${manifest.binary}`);

      expect(manifest.whisperCppRef).toMatch(/^v\d+\.\d+\.\d+$/);
      expect(["whisper-cli", "whisper-cli.exe"]).toContain(manifest.binary);
      expect(Number.isNaN(Date.parse(manifest.builtAt))).toBe(false);
      expect(binaryStat.isFile()).toBe(true);
      expect(binaryStat.size).toBeGreaterThan(1024 * 1024);
    }
  });
});

function readWavFormat(buffer: Buffer) {
  expect(buffer.toString("ascii", 0, 4)).toBe("RIFF");
  expect(buffer.toString("ascii", 8, 12)).toBe("WAVE");

  let offset = 12;
  let format:
    | {
        audioFormat: number;
        channels: number;
        sampleRate: number;
        bitsPerSample: number;
      }
    | undefined;
  let hasDataChunk = false;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (chunkId === "fmt ") {
      format = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        channels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14)
      };
    }

    if (chunkId === "data") {
      hasDataChunk = chunkSize > 0;
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (!format) {
    throw new Error("benchmark-5s.wav is missing a fmt chunk");
  }

  return { ...format, hasDataChunk };
}
