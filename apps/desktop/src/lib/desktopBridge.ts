import { invoke } from "@tauri-apps/api/core";
import { PROVIDERS, SUPPORTED_LANGUAGES, type CaptureSource, type InputMode, type LocalSession, type Snippet, type SupportedLanguage } from "@dictivo/shared";

const storageKey = "dictivo-local-sessions";
const INPUT_MODES = ["dictation", "email", "message", "raw", "prompt"] as const satisfies readonly InputMode[];

export type PrivateFastStatus = {
  ready: boolean;
  binaryPath?: string;
  modelPath?: string;
  modelId: string;
  modelName: string;
  message: string;
  setupHint: string;
};

export type PrivateFastTranscript = {
  text: string;
  durationMs: number;
  binaryPath: string;
  modelPath: string;
};

export type PasteResult = {
  pasted: boolean;
  copied: boolean;
  method?: string;
};

export type CopyResult = {
  copied: boolean;
  method?: string;
};

export type PermissionSettingsTarget = "microphone" | "accessibility" | "pasteAutomation";

export type ClipboardMarker = {
  kind: string;
  signature: string;
};

export type PrivateFastModel = {
  id: string;
  label: string;
  useCase: string;
  speed: string;
  quality: string;
  sizeLabel: string;
  notes: string;
  installed: boolean;
  selected: boolean;
  path?: string;
  sizeBytes?: number;
};

export type PrivateFastProfile = "fast" | "balanced" | "quality";

export type Tier = "fast" | "medium" | "slow";

export type TierAssignment = {
  modelId: string;
  realtimeFactor: number;
  predicted: boolean;
  downloaded: boolean;
  withinBudget: boolean;
};

export type RunnableTiers = {
  fast: TierAssignment;
  medium: TierAssignment;
  slow: TierAssignment;
  fingerprint: string;
  benchmarkedAt: string;
};

export type GpuInfo = {
  name: string;
  vramBytes: number | null;
};

export type HardwareProfile = {
  platform: "macos" | "windows" | "linux" | "web";
  arch: string;
  cpuCores: number;
  memoryTotalBytes?: number;
  accelerators: string[];
  performanceClass: "gpuHigh" | "cpuStrong" | "cpuWeak";
  recommendedModelId: string;
  recommendedProfile: PrivateFastProfile;
  reason: string;
};

export type PrivateFastTranscribeOptions = {
  language: SupportedLanguage;
  mode: InputMode;
  source: CaptureSource;
  profile: PrivateFastProfile;
  dictionary: string[];
  snippets: Array<Pick<Snippet, "trigger" | "replacement">>;
};

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function requestNativePermissions() {
  if (!isTauriRuntime()) {
    return {
      microphone: "web-preview",
      accessibility: "web-preview",
      pasteAutomation: "clipboard-only"
    };
  }
  const nativePermissions = await invoke<Record<string, string>>("request_permissions");
  const browserMicrophone = await browserMicrophonePermissionStatus();
  return browserMicrophone ? { ...nativePermissions, microphone: browserMicrophone } : nativePermissions;
}

async function browserMicrophonePermissionStatus(): Promise<string | null> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return null;

  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    if (status.state === "granted") return "granted";
    if (status.state === "denied") return "denied";
    if (status.state === "prompt") return "not-determined";
  } catch {
    return null;
  }

  return null;
}

export async function openPermissionSettings(target: PermissionSettingsTarget): Promise<void> {
  if (!isTauriRuntime()) throw new Error("Opening system permission settings requires the desktop app runtime.");
  return invoke<void>("open_permission_settings", { target });
}

export async function getClipboardMarker(): Promise<ClipboardMarker | null> {
  if (!isTauriRuntime()) return null;
  return invoke<ClipboardMarker>("clipboard_marker");
}

export async function pasteText(text: string, expectedClipboardMarker?: ClipboardMarker | null): Promise<PasteResult> {
  if (!isTauriRuntime()) {
    await writeClipboardInPreview(text);
    return { pasted: false, copied: true, method: "clipboard" };
  }
  return invoke<PasteResult>("paste_text", { text, expectedClipboardMarker: expectedClipboardMarker ?? null });
}

export async function copyText(text: string): Promise<CopyResult> {
  if (!isTauriRuntime()) {
    await writeClipboardInPreview(text);
    return { copied: true, method: "clipboard" };
  }
  return invoke<CopyResult>("copy_text", { text });
}

async function writeClipboardInPreview(text: string) {
  const clipboard = globalThis.navigator?.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return;
    } catch {
      if (copyWithSelectionFallback(text)) return;
      throw new Error("Clipboard copy was blocked by the browser preview. Use the desktop app or grant clipboard permission.");
    }
  }

  if (copyWithSelectionFallback(text)) return;
  throw new Error("Clipboard copy is not available in this preview.");
}

function copyWithSelectionFallback(text: string) {
  if (typeof document === "undefined" || !document.body || typeof document.execCommand !== "function") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.left = "-1000px";
  textarea.style.opacity = "0";

  const activeElement =
    typeof HTMLElement !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const selection = document.getSelection();
  const selectedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
    activeElement?.focus();
    if (selection && selectedRange) {
      selection.removeAllRanges();
      selection.addRange(selectedRange);
    }
  }
}

export async function saveLocalSession(session: LocalSession) {
  if (!isTauriRuntime()) {
    if (typeof localStorage === "undefined") return;
    const sessions = await listLocalSessions();
    const withoutCurrentSession = sessions.filter((item) => item.id !== session.id);
    localStorage.setItem(storageKey, JSON.stringify([session, ...withoutCurrentSession].slice(0, 100)));
    return;
  }
  await invoke("save_session", { session });
}

export async function listLocalSessions(): Promise<LocalSession[]> {
  if (!isTauriRuntime()) {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        localStorage.removeItem(storageKey);
        return [];
      }

      const sessions = parsed.filter(isLocalSession);
      if (sessions.length !== parsed.length) {
        if (sessions.length === 0) {
          localStorage.removeItem(storageKey);
        } else {
          localStorage.setItem(storageKey, JSON.stringify(sessions.slice(0, 100)));
        }
      }
      return sessions.slice(0, 100);
    } catch {
      localStorage.removeItem(storageKey);
      return [];
    }
  }
  return invoke<LocalSession[]>("list_sessions");
}

export async function clearLocalSessions() {
  if (!isTauriRuntime()) {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(storageKey);
    return;
  }
  await invoke("clear_sessions");
}

export async function deleteLocalSession(sessionId: string) {
  if (!isTauriRuntime()) {
    if (typeof localStorage === "undefined") return;
    const sessions = await listLocalSessions();
    const remaining = sessions.filter((session) => session.id !== sessionId);
    if (remaining.length === 0) {
      localStorage.removeItem(storageKey);
    } else {
      localStorage.setItem(storageKey, JSON.stringify(remaining));
    }
    return;
  }
  await invoke("delete_session", { sessionId });
}

function isLocalSession(value: unknown): value is LocalSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<LocalSession>;
	return (
	  typeof session.id === "string" &&
	  typeof session.title === "string" &&
	  isOneOf(session.mode, INPUT_MODES) &&
	  isOneOf(session.language, SUPPORTED_LANGUAGES) &&
	  session.privacyMode === "local-only" &&
	  isOneOf(session.provider, PROVIDERS) &&
	  typeof session.createdAt === "string" &&
	  typeof session.durationSeconds === "number" &&
	  typeof session.wordCount === "number" &&
	  typeof session.text === "string" &&
	  (session.rawText === undefined || typeof session.rawText === "string")
	);
}

function isOneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === "string" && (choices as readonly string[]).includes(value);
}

export async function getPrivateFastStatus(): Promise<PrivateFastStatus> {
  if (!isTauriRuntime()) {
    return {
      ready: false,
      modelId: "small",
      modelName: "small",
      message: "Private Fast requires the desktop app runtime.",
      setupHint: "Open Dictivo.app, then download or import a local model in Settings -> Local Engine."
    };
  }

  return invoke<PrivateFastStatus>("private_fast_status");
}

export async function getPrivateFastModels(): Promise<PrivateFastModel[]> {
  if (!isTauriRuntime()) {
    return [
      {
        id: "tiny",
        label: "Tiny",
        useCase: "Smoke test / very old machines",
        speed: "Fastest",
        quality: "Low",
        sizeLabel: "~75 MB",
        notes: "Use only to test permissions and end-to-end flow.",
        installed: false,
        selected: false
      },
      {
        id: "base",
        label: "Base",
        useCase: "Ultra-fast short dictation",
        speed: "Very fast",
        quality: "Basic",
        sizeLabel: "~142 MB",
        notes: "Good for quick feasibility checks; weaker on names and mixed language.",
        installed: false,
        selected: false
      },
      {
        id: "small",
        label: "Small",
        useCase: "Private Fast default dictation",
        speed: "Fast",
        quality: "Good",
        sizeLabel: "~469 MB",
        notes: "Best first local model for resource-aware dictation testing.",
        installed: false,
        selected: false
      },
      {
        id: "medium-q5_0",
        label: "Medium Q5",
        useCase: "Longer dictation and CPU-friendly higher accuracy",
        speed: "Moderate",
        quality: "Better",
        sizeLabel: "~540 MB",
        notes: "Quantized model for better local dictation without a large memory footprint.",
        installed: false,
        selected: false
      },
      {
        id: "large-v3-turbo-q5_0",
        label: "Large v3 Turbo Q5",
        useCase: "Recommended high-end local dictation",
        speed: "Moderate",
        quality: "High",
        sizeLabel: "~600 MB",
        notes: "Best balance for strong local dictation on Apple Silicon and capable Windows machines.",
        installed: false,
        selected: false
      },
      {
        id: "large-v3-turbo",
        label: "Large v3 Turbo",
        useCase: "Fast high-quality transcription",
        speed: "Slower",
        quality: "High",
        sizeLabel: "~1.6 GB",
        notes: "Fast and strong, but pruned for speed; not the highest-accuracy Whisper option.",
        installed: false,
        selected: false
      },
      {
        id: "large-v3",
        label: "Large v3",
        useCase: "Highest accuracy local transcription",
        speed: "Slowest",
        quality: "Highest",
        sizeLabel: "~3.1 GB",
        notes: "Use when quality matters more than disk, memory, and latency.",
        installed: false,
        selected: false
      }
    ];
  }

  return invoke<PrivateFastModel[]>("private_fast_models");
}

export async function getHardwareProfile(): Promise<HardwareProfile> {
  if (!isTauriRuntime()) {
    const cores = globalThis.navigator?.hardwareConcurrency || 4;
    const deviceMemory = (globalThis.navigator as Navigator & { deviceMemory?: number } | undefined)?.deviceMemory;
    const memoryTotalBytes = typeof deviceMemory === "number" ? deviceMemory * 1024 ** 3 : undefined;
    const performanceClass: "gpuHigh" | "cpuStrong" | "cpuWeak" =
      cores >= 10 ? "gpuHigh" : cores >= 6 ? "cpuStrong" : "cpuWeak";
    return {
      platform: "web",
      arch: "browser",
      cpuCores: cores,
      memoryTotalBytes,
      accelerators: [],
      performanceClass,
      recommendedModelId:
        performanceClass === "gpuHigh"
          ? "large-v3-turbo-q5_0"
          : performanceClass === "cpuStrong"
            ? "small"
            : "base",
      recommendedProfile:
        performanceClass === "gpuHigh"
          ? "quality"
          : performanceClass === "cpuStrong"
            ? "balanced"
            : "fast",
      reason: "Browser preview can only estimate hardware from exposed navigator signals."
    };
  }

  return invoke<HardwareProfile>("hardware_profile");
}

export async function detectGpu(): Promise<GpuInfo[]> {
  if (!isTauriRuntime()) return [];
  return invoke<GpuInfo[]>("detect_gpu");
}

export async function getRunnableTiers(): Promise<RunnableTiers> {
  if (!isTauriRuntime()) {
    // Web preview pretends all three tiers exist — fast/medium downloaded and
    // within budget; slow not downloaded and over budget so the UI can exercise
    // the warning state too.
    return {
      fast: { modelId: "base", realtimeFactor: 0.5, predicted: true, downloaded: true, withinBudget: true },
      medium: { modelId: "small", realtimeFactor: 0.9, predicted: false, downloaded: true, withinBudget: true },
      slow: { modelId: "large-v3", realtimeFactor: 3.2, predicted: true, downloaded: false, withinBudget: false },
      fingerprint: "web-preview",
      benchmarkedAt: ""
    };
  }
  return invoke<RunnableTiers>("runnable_tiers");
}

export async function writeRunnableTiers(tiers: RunnableTiers): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("write_runnable_tiers", { tiers });
}

export async function benchmarkTier(modelId: string): Promise<number> {
  if (!isTauriRuntime()) throw new Error("Benchmark requires the desktop app runtime.");
  return invoke<number>("benchmark_tier", { modelId });
}

export async function finalizeCalibration(
  measuredMediumRtf: number,
  mediumModelId: string
): Promise<RunnableTiers> {
  if (!isTauriRuntime()) {
    return {
      fast: { modelId: "base", realtimeFactor: (measuredMediumRtf * 0.4) / 0.7, predicted: true, downloaded: false, withinBudget: true },
      medium: { modelId: mediumModelId, realtimeFactor: measuredMediumRtf, predicted: false, downloaded: true, withinBudget: true },
      slow: { modelId: "large-v3", realtimeFactor: measuredMediumRtf * 5.0, predicted: true, downloaded: false, withinBudget: false },
      fingerprint: "web-preview",
      benchmarkedAt: new Date().toISOString()
    };
  }
  return invoke<RunnableTiers>("finalize_calibration", { measuredMediumRtf, mediumModelId });
}

export async function rerunBenchmark(): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("rerun_benchmark");
}

export async function selectPrivateFastModel(modelId: string): Promise<PrivateFastStatus> {
  if (!isTauriRuntime()) throw new Error("Private Fast model selection requires the desktop app runtime.");
  return invoke<PrivateFastStatus>("select_private_fast_model", { modelId });
}

export async function downloadPrivateFastModel(modelId: string): Promise<PrivateFastStatus> {
  if (!isTauriRuntime()) throw new Error("Private Fast model download requires the desktop app runtime.");
  return invoke<PrivateFastStatus>("download_private_fast_model", { modelId });
}

export async function importPrivateFastModel(modelId: string, sourcePath: string): Promise<PrivateFastStatus> {
  if (!isTauriRuntime()) throw new Error("Private Fast model import requires the desktop app runtime.");
  return invoke<PrivateFastStatus>("import_private_fast_model", { modelId, sourcePath });
}

export async function deletePrivateFastModel(modelId: string): Promise<PrivateFastStatus> {
  if (!isTauriRuntime()) throw new Error("Private Fast model deletion requires the desktop app runtime.");
  return invoke<PrivateFastStatus>("delete_private_fast_model", { modelId });
}

export async function transcribePrivateFast(audio: Blob, options: PrivateFastTranscribeOptions): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error("Private Fast requires the desktop app runtime.");
  }
  if (!audio.type.includes("wav")) {
    throw new Error("Private Fast expects a WAV recording. Restart recording in Local only mode.");
  }

  const result = await invoke<PrivateFastTranscript>("transcribe_private_fast", {
    audioBase64: await blobToBase64(audio),
    language: options.language,
    promptTerms: buildPromptTerms(options.dictionary, options.snippets),
    mode: options.mode,
    source: options.source,
    profile: options.profile
  });

  return result.text;
}

function buildPromptTerms(dictionary: string[], snippets: Array<Pick<Snippet, "trigger" | "replacement">>) {
  return [...dictionary, ...snippets.map((snippet) => snippet.trigger)]
    .map((term) => term.trim())
    .filter((term) => term.length > 1)
    .slice(0, 80);
}

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

// ============================================================================
// License + Updates
// ============================================================================

export type LicenseSummary = {
  present: boolean;
  email: string;
  productName: string;
  createdAt: string;
  updatesUntil: string;
  daysRemaining: number;
  status: string;
};

export type UpdateInfo = {
  version: string;
  currentVersion: string;
  pubDate: string;
  notes: string;
  windowBlocked: boolean;
};

export type UpdateCheckKind = "available" | "windowExpired" | "upToDate" | "failed";

export type UpdateCheckResult = {
  kind: UpdateCheckKind;
  info: UpdateInfo | null;
  error: string | null;
};

export async function activateLicense(licenseKey: string, instanceName: string): Promise<LicenseSummary> {
  if (!isTauriRuntime()) {
    throw new Error("License activation requires the desktop app runtime.");
  }
  return invoke<LicenseSummary>("license_activate", { licenseKey, instanceName });
}

export async function getLicense(): Promise<LicenseSummary> {
  if (!isTauriRuntime()) {
    return {
      present: false,
      email: "",
      productName: "",
      createdAt: "",
      updatesUntil: "",
      daysRemaining: 0,
      status: "web-preview"
    };
  }
  return invoke<LicenseSummary>("license_get");
}

export async function refreshLicense(): Promise<LicenseSummary> {
  if (!isTauriRuntime()) throw new Error("License refresh requires the desktop app runtime.");
  return invoke<LicenseSummary>("license_refresh");
}

export async function deactivateLicense(): Promise<void> {
  if (!isTauriRuntime()) throw new Error("License deactivation requires the desktop app runtime.");
  return invoke<void>("license_deactivate");
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  if (!isTauriRuntime()) {
    return { kind: "upToDate", info: null, error: null };
  }
  return invoke<UpdateCheckResult>("updater_check_now");
}

export async function installUpdate(): Promise<void> {
  if (!isTauriRuntime()) throw new Error("Installing updates requires the desktop app runtime.");
  return invoke<void>("updater_install");
}
