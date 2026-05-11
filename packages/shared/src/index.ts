export const SUPPORTED_LANGUAGES = [
  "en",
  "zh",
  "es",
  "ja",
  "fr",
  "de"
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: "English",
  zh: "中文",
  es: "Español",
  ja: "日本語",
  fr: "Français",
  de: "Deutsch"
};

export const PROVIDERS = ["local-whisper"] as const;

export type ProviderId = (typeof PROVIDERS)[number];

export type PrivacyMode = "local-only";

export type CaptureSource = "microphone";

export type InputMode =
  | "dictation"
  | "email"
  | "message"
  | "raw"
  | "prompt";

export type ProcessingMode = {
  id: string;
  label: string;
  inputMode: InputMode;
  instruction: string;
  language: SupportedLanguage;
  localOnly: boolean;
};

export type DictionaryTerm = {
  id: string;
  value: string;
  language: SupportedLanguage;
  createdAt: string;
};

export type Snippet = {
  id: string;
  trigger: string;
  replacement: string;
  language: SupportedLanguage;
  createdAt: string;
};

export type TranscriptSegment = {
  id: string;
  speaker?: string;
  text: string;
  startedAtMs: number;
  endedAtMs: number;
  isFinal: boolean;
};

export type LocalSession = {
  id: string;
  title: string;
  mode: InputMode;
  language: SupportedLanguage;
  privacyMode: PrivacyMode;
  provider: ProviderId;
  createdAt: string;
  durationSeconds: number;
  wordCount: number;
  rawText?: string;
  text: string;
};

export type ProviderEvent =
  | {
      type: "partial";
      segment: TranscriptSegment;
    }
  | {
      type: "final";
      segment: TranscriptSegment;
    }
  | {
      type: "error";
      message: string;
      recoverable: boolean;
    };

export type StartStreamOptions = {
  provider: ProviderId;
  privacyMode: PrivacyMode;
  language: SupportedLanguage;
  source: CaptureSource;
  mode: InputMode;
};

export type TranscribeFileOptions = Omit<StartStreamOptions, "source"> & {
  mimeType: string;
};

export type FinalizeTranscriptOptions = {
  language: SupportedLanguage;
  mode: InputMode;
  targetApp?: string;
  dictionary: string[];
  snippets: Array<Pick<Snippet, "trigger" | "replacement">>;
};

export type VoiceProvider = {
  id: ProviderId;
  startStream(options: StartStreamOptions): AsyncIterable<ProviderEvent>;
  transcribeFile(audio: Blob | ArrayBuffer, options: TranscribeFileOptions): Promise<string>;
  finalizeTranscript(text: string, options: FinalizeTranscriptOptions): Promise<string>;
};

export const FORBIDDEN_BACKEND_CONTENT_FIELDS = [
  "audio",
  "audioBlob",
  "audioUrl",
  "transcript",
  "transcriptText",
  "text",
  "summary",
  "meetingSummary",
  "segments",
  "dictionary",
  "dictionaryTerms",
  "snippets",
  "providerCredentials",
  "apiKey"
] as const;

export type ForbiddenBackendContentField = (typeof FORBIDDEN_BACKEND_CONTENT_FIELDS)[number];

export function findForbiddenContentFields(value: unknown): string[] {
  const matches = new Set<string>();
  visit(value, []);
  return [...matches].sort();

  function visit(node: unknown, path: string[]) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, [...path, String(index)]));
      return;
    }

    for (const [key, child] of Object.entries(node)) {
      if ((FORBIDDEN_BACKEND_CONTENT_FIELDS as readonly string[]).includes(key)) {
        matches.add([...path, key].join("."));
      }
      visit(child, [...path, key]);
    }
  }
}

export function estimateWordCount(text: string, language: SupportedLanguage): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  if (language === "zh" || language === "ja") {
    return [...trimmed.replace(/\s+/g, "")].length;
  }
  return trimmed.split(/\s+/).filter(Boolean).length;
}
