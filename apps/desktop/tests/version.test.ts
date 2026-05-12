import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type PackageJson = {
  version: string;
  dependencies?: Record<string, string>;
};

type PackageLock = {
  version: string;
  packages: Record<string, { version?: string; dependencies?: Record<string, string> }>;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
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
    const cargoToml = readFileSync("src-tauri/Cargo.toml", "utf8");
    const cargoLock = readFileSync("src-tauri/Cargo.lock", "utf8");
    const viteConfig = readFileSync("vite.config.ts", "utf8");

    const cargoVersion = cargoToml.match(/^version = "([^"]+)"/m)?.[1];
    const cargoLockVersion = cargoLock.match(/\[\[package\]\]\nname = "dictivo"\nversion = "([^"]+)"/)?.[1];

    expect(tauriConfig.version).toBe(rootPackage.version);
    expect(cargoVersion).toBe(rootPackage.version);
    expect(cargoLockVersion).toBe(rootPackage.version);
    expect(viteConfig).toContain("__DICTIVO_VERSION__");
    expect(viteConfig).toContain("./package.json");
  });
});
