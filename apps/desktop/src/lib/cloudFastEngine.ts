import { resolveTranscriptLanguage, type FinalizeTranscriptOptions, type Snippet, type SupportedLanguage, type TranscriptionLanguage } from "@dictivo/shared";
import { getCloudFastSession, isTauriRuntime, type CloudFastSession } from "./desktopBridge";
import { polishLocalTranscript } from "./localPolish";
import { DEFAULT_LOCAL_PROCESSING, type LocalProcessingSettings } from "./settingsStore";

const LOCAL_CLOUD_FAST_API_BASE_URL = "http://localhost:8787";
const PRODUCTION_CLOUD_FAST_API_BASE_URL = "https://api.dictivo.app";

export type CloudFastEntitlement = {
  available: boolean;
  plan: string;
  priceUsdMonthly: string;
  monthlySecondsLimit: number;
  monthlySecondsUsed: number;
  renewsAt: string | null;
  upgradeUrl: string | null;
  billingPortalUrl?: string | null;
  privacyNotice: string;
};

export type CloudFastDictationOptions = {
  clientSessionId: string;
  language: TranscriptionLanguage;
  dictionary: string[];
  snippets: Array<Pick<Snippet, "trigger" | "replacement">>;
  mode: FinalizeTranscriptOptions["mode"];
  durationSeconds: number;
  appVersion: string;
  platform?: "macos" | "windows" | "linux" | "web";
  localProcessing?: LocalProcessingSettings;
};

export type CloudFastDictationResult = {
  rawText: string;
  finalizedText: string;
  language: SupportedLanguage;
  fallbackUsed: boolean;
};

type CloudFastTranscriptResponse = {
  text?: unknown;
  fallbackUsed?: unknown;
  error?: unknown;
  message?: unknown;
};

let cachedCloudFastSession: CloudFastSession | null = null;

export function clearCloudFastSessionCache() {
  cachedCloudFastSession = null;
}

export async function getCloudFastEntitlement(): Promise<CloudFastEntitlement> {
  const apiBaseUrl = cloudFastApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/v1/cloud-fast/entitlement`, {
    headers: await cloudFastHeaders(apiBaseUrl)
  });
  if (!response.ok) throw new Error("Cloud Fast status is unavailable.");
  return await response.json() as CloudFastEntitlement;
}

export async function runCloudFastDictation(audio: Blob, options: CloudFastDictationOptions): Promise<CloudFastDictationResult> {
  const apiBaseUrl = cloudFastApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/v1/cloud-fast/transcribe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...await cloudFastHeaders(apiBaseUrl)
    },
    body: JSON.stringify({
      clientSessionId: options.clientSessionId,
      audioBase64: await blobToBase64(audio),
      mimeType: audio.type || "audio/wav",
      durationSeconds: options.durationSeconds,
      language: options.language,
      mode: options.mode,
      platform: options.platform,
      appVersion: options.appVersion
    })
  });

  const payload = await response.json().catch(() => ({})) as CloudFastTranscriptResponse;
  if (!response.ok) {
    const message = cloudFastErrorMessage(payload, options.language);
    throw new Error(message);
  }
  if (typeof payload.text !== "string") throw new Error("Cloud Fast returned no transcript.");

  const language = resolveTranscriptLanguage(options.language, payload.text);
  const finalizedText = polishLocalTranscript(payload.text, {
    language,
    mode: options.mode,
    dictionary: options.dictionary,
    snippets: options.snippets,
    processing: options.localProcessing ?? DEFAULT_LOCAL_PROCESSING
  });

  return {
    rawText: payload.text,
    finalizedText,
    language,
    fallbackUsed: payload.fallbackUsed === true
  };
}

function cloudFastErrorMessage(payload: CloudFastTranscriptResponse, language: CloudFastDictationOptions["language"]) {
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  if (payload.error === "invalid_cloud_fast_request" && language === "auto") {
    return "Cloud Fast service rejected automatic language detection. Update Dictivo or try again after the service finishes deploying.";
  }
  if (typeof payload.error === "string" && payload.error.trim()) {
    return `Cloud Fast failed: ${payload.error.replace(/_/g, " ")}.`;
  }
  return "Cloud Fast transcription failed.";
}

function cloudFastApiBaseUrl() {
  const envUrl = import.meta.env.VITE_DICTIVO_API_BASE_URL as string | undefined;
  const defaultUrl = import.meta.env.DEV ? LOCAL_CLOUD_FAST_API_BASE_URL : PRODUCTION_CLOUD_FAST_API_BASE_URL;
  return (envUrl || defaultUrl).replace(/\/$/, "");
}

async function cloudFastHeaders(apiBaseUrl: string): Promise<Record<string, string>> {
  if (isTauriRuntime()) {
    const session = await activeCloudFastSession(apiBaseUrl);
    return { authorization: `${session.tokenType} ${session.token}` };
  }

  const userId = localCloudFastUserId();
  return userId ? { "x-user-id": userId } : {};
}

async function activeCloudFastSession(apiBaseUrl: string) {
  if (cachedCloudFastSession && new Date(cachedCloudFastSession.expiresAt).getTime() - Date.now() > 60_000) {
    return cachedCloudFastSession;
  }
  cachedCloudFastSession = await getCloudFastSession(apiBaseUrl);
  return cachedCloudFastSession;
}

function localCloudFastUserId() {
  if (typeof localStorage === "undefined") return "";
  const storageKey = "dictivo-cloud-fast-user-id";
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;
  const next = `local-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  localStorage.setItem(storageKey, next);
  return next;
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
