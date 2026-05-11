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

run("git", ["--version"]);
run("cmake", ["--version"]);

rmSync(sourceDir, { recursive: true, force: true });
mkdirSync(dirname(sourceDir), { recursive: true });
mkdirSync(outputDir, { recursive: true });

run("git", ["clone", "--depth", "1", "--branch", whisperRef, "https://github.com/ggml-org/whisper.cpp.git", sourceDir]);

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
