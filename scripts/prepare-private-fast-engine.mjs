import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const whisperRef = process.env.WHISPER_CPP_REF || "v1.8.4";
const sourceDir = join(repoRoot, ".private-fast-build", "whisper.cpp");
const buildDir = join(sourceDir, "build");
const outputDir = join(repoRoot, "apps", "desktop", "src-tauri", "resources", "private-fast", "bin");

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  preparePrivateFastEngine();
}

export function preparePrivateFastEngine() {
  run("git", ["--version"]);
  run("cmake", ["--version"]);

  rmSync(sourceDir, { recursive: true, force: true });
  mkdirSync(dirname(sourceDir), { recursive: true });
  mkdirSync(outputDir, { recursive: true });
  cleanGeneratedOutput(outputDir);

  const cloneArgs = ["clone", "--depth", "1", "--branch", whisperRef, "https://github.com/ggml-org/whisper.cpp.git", sourceDir];
  runWithRetry("git", cloneArgs, {
    attempts: 4,
    beforeRetry: () => rmSync(sourceDir, { recursive: true, force: true })
  });

  const cmakeArgs = [
    "-S",
    sourceDir,
    "-B",
    buildDir,
    "-DWHISPER_BUILD_TESTS=OFF",
    "-DWHISPER_BUILD_EXAMPLES=ON",
    "-DGGML_NATIVE=OFF",
    "-DBUILD_SHARED_LIBS=OFF"
  ];

  if (process.platform === "darwin") {
    cmakeArgs.push("-DCMAKE_OSX_ARCHITECTURES=arm64;x86_64");
  }

  run("cmake", cmakeArgs);
  run("cmake", ["--build", buildDir, "--config", "Release", "--target", "whisper-cli"]);

  const binaryName = process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
  const binaryPath = findFile(buildDir, binaryName);
  if (!binaryPath) {
    throw new Error(`Built ${binaryName} was not found under ${buildDir}`);
  }

  const outputBinary = join(outputDir, binaryName);
  copyFileSync(binaryPath, outputBinary);

  if (process.platform === "win32") {
    for (const file of readdirSync(dirname(binaryPath))) {
      if (file.toLowerCase().endsWith(".dll")) {
        copyFileSync(join(dirname(binaryPath), file), join(outputDir, file));
      }
    }
  } else {
    run("chmod", ["755", outputBinary]);
  }

  writeFileSync(
    join(outputDir, "manifest.json"),
    `${JSON.stringify({ whisperCppRef: whisperRef, binary: binaryName, builtAt: new Date().toISOString() }, null, 2)}\n`
  );

  console.log(`Prepared ${outputBinary}`);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    shell: false,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
}

function runWithRetry(command, args, { attempts, beforeRetry }) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return run(command, args);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const delayMs = 2_500 * attempt;
      console.warn(`${command} ${args.join(" ")} failed on attempt ${attempt}/${attempts}. Retrying in ${delayMs}ms...`);
      beforeRetry?.();
      sleep(delayMs);
    }
  }

  throw lastError;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function cleanGeneratedOutput(directory) {
  for (const entry of readdirSync(directory)) {
    const lowerEntry = entry.toLowerCase();
    if (
      entry === "manifest.json" ||
      lowerEntry === "whisper-cli" ||
      lowerEntry === "whisper-cli.exe" ||
      lowerEntry.endsWith(".dll")
    ) {
      rmSync(join(directory, entry), { force: true });
    }
  }
}

function findFile(root, fileName) {
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      const found = findFile(path, fileName);
      if (found) return found;
    } else if (entry === fileName) {
      return path;
    }
  }

  return "";
}
