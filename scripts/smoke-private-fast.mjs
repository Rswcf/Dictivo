import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPrivateFastSmoke();
}

export function runPrivateFastSmoke() {
  const appPath = resolveAppPath();
  verifyInstalledAppBundle(appPath);
  const binaryPath = resolveWhisperCli(appPath);
  const modelPath = resolveModelPath();
  const audioPath = resolveAudioPath();
  const tempDir = mkdtempSync(join(tmpdir(), "dictivo-private-fast-smoke-"));
  const outputStem = join(tempDir, "transcript");
  const outputPath = `${outputStem}.txt`;

  try {
    const started = Date.now();
    const result = spawnSync(
      binaryPath,
      ["-m", modelPath, "-f", audioPath, "-l", "en", "-otxt", "-of", outputStem, "--no-prints"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 16
      }
    );

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      throw new Error(
        `whisper-cli exited with ${result.status}\n\nstderr:\n${result.stderr}\n\nstdout:\n${result.stdout}`
      );
    }

    if (!existsSync(outputPath)) {
      throw new Error(`whisper-cli completed, but no transcript was written to ${outputPath}`);
    }

    const transcript = readFileSync(outputPath, "utf8").trim();
    validateSmokeTranscript(transcript, result.stderr);

    console.log("Private Fast smoke passed.");
    if (appPath) {
      console.log(`App: ${appPath}`);
    }
    console.log(`Binary: ${binaryPath}`);
    console.log(`Model: ${modelPath}`);
    console.log(`Audio: ${audioPath}`);
    console.log(`Transcript: ${transcript}`);
    console.log(`Elapsed: ${Date.now() - started} ms`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export function validateSmokeTranscript(transcript, stderr = "") {
  const normalizedTranscript = transcript.toLowerCase();
  const normalizedStderr = stderr.toLowerCase();

  if (!normalizedTranscript.includes("quick brown fox") || !normalizedTranscript.includes("local dictation")) {
    throw new Error(`Unexpected smoke transcript: ${JSON.stringify(transcript)}`);
  }

  if (normalizedStderr.includes("/dev/null.txt") || normalizedStderr.includes("failed to open")) {
    throw new Error(`whisper-cli reported an output-file error:\n${stderr}`);
  }
}

function resolveWhisperCli(appPath = resolveAppPath()) {
  const binaryName = platform() === "win32" ? "whisper-cli.exe" : "whisper-cli";
  const explicit = process.env.DICTIVO_WHISPER_CLI;
  const candidates = [
    explicit,
    appPath ? join(appPath, "Contents", "Resources", "private-fast", "bin", binaryName) : "",
    join(repoRoot, "apps", "desktop", "src-tauri", "resources", "private-fast", "bin", binaryName)
  ].filter(Boolean);

  return firstExistingFile(candidates, "whisper-cli binary");
}

function resolveAppPath() {
  if (process.env.DICTIVO_APP_PATH) {
    return process.env.DICTIVO_APP_PATH;
  }
  return platform() === "darwin" ? "/Applications/Dictivo.app" : "";
}

function verifyInstalledAppBundle(candidate) {
  if (!candidate || platform() !== "darwin") {
    return;
  }

  if (!existsSync(candidate)) {
    throw new Error(`Unable to find installed Dictivo app bundle at ${candidate}`);
  }

  const plistPath = join(candidate, "Contents", "Info.plist");
  const expectedVersion = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version;
  const shortVersion = readPlistValue(plistPath, "CFBundleShortVersionString");
  const bundleVersion = readPlistValue(plistPath, "CFBundleVersion");
  const microphoneUsage = readPlistValue(plistPath, "NSMicrophoneUsageDescription");
  const appleEventsUsage = readPlistValue(plistPath, "NSAppleEventsUsageDescription");

  validateInstalledAppMetadata({
    expectedVersion,
    shortVersion,
    bundleVersion,
    microphoneUsage,
    appleEventsUsage
  });
}

export function validateInstalledAppMetadata({
  expectedVersion,
  shortVersion,
  bundleVersion,
  microphoneUsage,
  appleEventsUsage
}) {
  if (shortVersion !== expectedVersion || bundleVersion !== expectedVersion) {
    throw new Error(
      `Installed Dictivo version mismatch. Expected ${expectedVersion}, got ${shortVersion}/${bundleVersion}.`
    );
  }

  if (!microphoneUsage.toLowerCase().includes("microphone")) {
    throw new Error("Installed app is missing an actionable NSMicrophoneUsageDescription.");
  }

  if (!appleEventsUsage.toLowerCase().includes("paste")) {
    throw new Error("Installed app is missing an actionable NSAppleEventsUsageDescription.");
  }
}

function readPlistValue(plistPath, key) {
  const result = spawnSync("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, plistPath], {
    encoding: "utf8"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Unable to read ${key} from ${plistPath}:\n${result.stderr}`);
  }

  return result.stdout.trim();
}

function resolveModelPath() {
  const explicit = process.env.DICTIVO_WHISPER_MODEL;
  if (explicit) {
    return firstExistingFile([explicit], "Private Fast model");
  }

  const modelId = process.env.DICTIVO_SMOKE_MODEL_ID || "small";
  const modelName = `ggml-${modelId}.bin`;
  const roots = privateFastRoots();
  const exactCandidates = roots.flatMap((root) => [
    join(root, "models", modelName),
    join(root, "whisper.cpp", "models", modelName)
  ]);

  const exact = exactCandidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (exact) {
    return exact;
  }

  for (const root of roots) {
    for (const modelsDir of [join(root, "models"), join(root, "whisper.cpp", "models")]) {
      const fallback = firstModelInDir(modelsDir);
      if (fallback) {
        return fallback;
      }
    }
  }

  throw new Error(
    `No Private Fast model found. Set DICTIVO_WHISPER_MODEL or install ${modelName} under one of:\n${roots.join("\n")}`
  );
}

function resolveAudioPath() {
  const explicit = process.env.DICTIVO_SMOKE_AUDIO;
  const candidates = [
    explicit,
    join(repoRoot, "apps", "desktop", "src-tauri", "resources", "benchmark-5s.wav")
  ].filter(Boolean);

  return firstExistingFile(candidates, "smoke audio");
}

function privateFastRoots() {
  const roots = [];
  if (process.env.DICTIVO_PRIVATE_FAST_HOME) {
    roots.push(process.env.DICTIVO_PRIVATE_FAST_HOME);
  }

  if (platform() === "darwin") {
    roots.push(join(homedir(), "Library", "Application Support", "Dictivo", "private-fast"));
  } else if (platform() === "win32") {
    roots.push(join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "Dictivo", "private-fast"));
  } else {
    roots.push(join(homedir(), ".dictivo", "private-fast"));
  }

  return [...new Set(roots)];
}

export function firstModelInDir(modelsDir) {
  if (!existsSync(modelsDir)) {
    return "";
  }

  const preferred = ["ggml-small.bin", "ggml-base.bin", "ggml-tiny.bin"];
  for (const name of preferred) {
    const candidate = join(modelsDir, name);
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }

  const found = readdirSync(modelsDir)
    .filter((entry) => entry.startsWith("ggml-") && entry.endsWith(".bin"))
    .sort()[0];
  return found ? join(modelsDir, found) : "";
}

function firstExistingFile(candidates, label) {
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }

  throw new Error(`Unable to find ${label}. Checked:\n${candidates.join("\n")}`);
}
