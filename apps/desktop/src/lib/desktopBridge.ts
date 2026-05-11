import { invoke } from "@tauri-apps/api/core";
import type { CaptureSource, InputMode, LocalSession, Snippet, SupportedLanguage } from "@dictivo/shared";

const storageKey = "dictivo-local-sessions";

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

export type HardwareProfile = {
  platform: "macos" | "windows" | "linux" | "web";
  arch: string;
  cpuCores: number;
  memoryTotalBytes?: number;
  accelerators: string[];
  performanceClass: "low" | "mid" | "high";
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
  return "__TAURI_INTERNALS__" in window;
}

export async function requestNativePermissions() {
  if (!isTauriRuntime()) {
    return {
      microphone: "granted",
      accessibility: "web-preview",
      pasteAutomation: "clipboard-only"
    };
  }
  return invoke("request_permissions");
}

export async function getClipboardMarker(): Promise<ClipboardMarker | null> {
  if (!isTauriRuntime()) return null;
  return invoke<ClipboardMarker>("clipboard_marker");
}

export async function pasteText(text: string, expectedClipboardMarker?: ClipboardMarker | null): Promise<PasteResult> {
  if (!isTauriRuntime()) {
    await navigator.clipboard?.writeText(text);
    return { pasted: false, copied: true, method: "clipboard" };
  }
  return invoke<PasteResult>("paste_text", { text, expectedClipboardMarker: expectedClipboardMarker ?? null });
}

export async function saveLocalSession(session: LocalSession) {
  if (!isTauriRuntime()) {
    const sessions = await listLocalSessions();
    localStorage.setItem(storageKey, JSON.stringify([session, ...sessions].slice(0, 100)));
    return;
  }
  await invoke("save_session", { session });
}

export async function listLocalSessions(): Promise<LocalSession[]> {
  if (!isTauriRuntime()) {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as LocalSession[]) : [];
  }
  return invoke<LocalSession[]>("list_sessions");
}

export async function clearLocalSessions() {
  if (!isTauriRuntime()) {
    localStorage.removeItem(storageKey);
    return;
  }
  await invoke("clear_sessions");
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
    const cores = navigator.hardwareConcurrency || 4;
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const memoryTotalBytes = typeof deviceMemory === "number" ? deviceMemory * 1024 ** 3 : undefined;
    const performanceClass = cores >= 10 ? "high" : cores >= 6 ? "mid" : "low";
    return {
      platform: "web",
      arch: "browser",
      cpuCores: cores,
      memoryTotalBytes,
      accelerators: [],
      performanceClass,
      recommendedModelId: performanceClass === "high" ? "large-v3-turbo-q5_0" : performanceClass === "mid" ? "small" : "base",
      recommendedProfile: performanceClass === "high" ? "quality" : performanceClass === "mid" ? "balanced" : "fast",
      reason: "Browser preview can only estimate hardware from exposed navigator signals."
    };
  }

  return invoke<HardwareProfile>("hardware_profile");
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
  return [...dictionary, ...snippets.flatMap((snippet) => [snippet.trigger, snippet.replacement])]
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
