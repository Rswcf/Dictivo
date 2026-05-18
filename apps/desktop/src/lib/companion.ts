import type { SupportedLanguage } from "@dictivo/shared";
import type { CompanionAvatar, CompanionDisplayMode } from "./settingsStore";

export type CompanionPhase = "idle" | "recording" | "processing" | "complete" | "blocked" | "error";

// fields kept for snapshot contract stability; bubble currently renders title + detail only.
export type CompanionSnapshot = {
  enabled: boolean;
  displayMode: CompanionDisplayMode;
  avatar: CompanionAvatar;
  customAvatarDataUrl?: string;
  customAvatarName?: string;
  phase: CompanionPhase;
  hotkey: string;
  title: string;
  detail: string;
  summary: string;
  transcriptPreview: string;
  pasteStatus: string;
  recordingStartedAt?: number;
  wordCount: number;
};

type CompanionSnapshotInput = {
  enabled: boolean;
  displayMode: CompanionDisplayMode;
  avatar: CompanionAvatar;
  customAvatarDataUrl?: string;
  customAvatarName?: string;
  phase: CompanionPhase;
  hotkey: string;
  liveText: string;
  statusMessage: string;
  pasteStatus: string;
  recordingStartedAt?: number;
  language: SupportedLanguage;
};

export function buildCompanionSnapshot(input: CompanionSnapshotInput): CompanionSnapshot {
  const transcriptPreview = previewText(input.liveText);
  const wordCount = countWords(transcriptPreview, input.language);
  const title = phaseTitle(input.phase);
  const detail = phaseDetail(input.phase, input.hotkey, wordCount, input.statusMessage);
  const summary = phaseSummary(input.phase, input.statusMessage, transcriptPreview, wordCount);

  return {
    enabled: input.enabled,
    displayMode: input.displayMode,
    avatar: input.avatar,
    customAvatarDataUrl: input.avatar === "custom" ? input.customAvatarDataUrl : undefined,
    customAvatarName: input.avatar === "custom" ? input.customAvatarName : undefined,
    phase: input.phase,
    hotkey: input.hotkey,
    title,
    detail,
    summary,
    transcriptPreview,
    pasteStatus: input.pasteStatus,
    recordingStartedAt: input.recordingStartedAt,
    wordCount
  };
}

function phaseTitle(phase: CompanionPhase) {
  if (phase === "recording") return "Listening";
  if (phase === "processing") return "Transcribing";
  if (phase === "complete") return "Transcript copied to clipboard";
  if (phase === "blocked") return "Setup needed";
  if (phase === "error") return "Needs attention";
  return "Standing by";
}

function phaseDetail(phase: CompanionPhase, hotkey: string, wordCount: number, statusMessage: string) {
  if (phase === "recording") return `${hotkey} to stop`;
  if (phase === "processing") {
    const status = statusMessage.toLowerCase();
    if (status.includes("stopping recording")) return "Waiting for microphone";
    if (status.includes("cloud fast")) return "Cloud Fast is working";
    return "Local engine is working";
  }
  if (phase === "complete") {
    if (wordCount <= 0) return "Transcript copied";
    return `${wordCount} ${wordCount === 1 ? "word" : "words"} saved. Looking sharp!`;
  }
  if (phase === "blocked") return "Open Engine settings";
  if (phase === "error") return conciseStatus(statusMessage) || "Check the main window";
  return `${hotkey} to record`;
}

function phaseSummary(phase: CompanionPhase, statusMessage: string, transcriptPreview: string, wordCount: number) {
  if (phase === "recording") return "Dictivo is recording locally.";
  if (phase === "processing") return statusMessage || "Processing audio on this device.";
  if (phase === "complete") return transcriptPreview || `Captured ${wordCount} ${wordCount === 1 ? "word" : "words"}.`;
  if (phase === "blocked" || phase === "error") return statusMessage || "Dictivo needs a local engine check.";
  return "Local dictation is ready.";
}

function previewText(text: string) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.startsWith("Recording locally.") || trimmed.startsWith("Recording for Cloud Fast.")) return "";
  return trimmed.length > 118 ? `${trimmed.slice(0, 115).trim()}...` : trimmed;
}

function conciseStatus(statusMessage: string) {
  const trimmed = statusMessage.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed.length > 68 ? `${trimmed.slice(0, 65).trim()}...` : trimmed;
}

function countWords(text: string, language: SupportedLanguage) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  if (language === "zh" || language === "ja") return [...trimmed.replace(/\s+/g, "")].length;
  return trimmed.split(/\s+/).filter(Boolean).length;
}
