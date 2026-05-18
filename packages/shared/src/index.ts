export const SUPPORTED_LANGUAGES = [
  "en",
  "zh",
  "es",
  "ja",
  "fr",
  "de",
  "vi"
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const TRANSCRIPTION_LANGUAGES = [
  "auto",
  ...SUPPORTED_LANGUAGES
] as const;

export type TranscriptionLanguage = (typeof TRANSCRIPTION_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: "English",
  zh: "中文",
  es: "Español",
  ja: "日本語",
  fr: "Français",
  de: "Deutsch",
  vi: "Tiếng Việt"
};

export const TRANSCRIPTION_LANGUAGE_LABELS: Record<TranscriptionLanguage, string> = {
  auto: "Auto-detect",
  ...LANGUAGE_LABELS
};

export const PROVIDERS = ["local-whisper", "cloud-fast"] as const;

export type ProviderId = (typeof PROVIDERS)[number];

export type PrivacyMode = "local-only" | "cloud-fast";

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
  "body",
  "content",
  "finalText",
  "initialPrompt",
  "messageContent",
  "messages",
  "prompt",
  "promptTerms",
  "promptText",
  "rawText",
  "snippet",
  "snippetReplacement",
  "transcript",
  "transcribedText",
  "transcription",
  "transcriptionText",
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

const NORMALIZED_FORBIDDEN_BACKEND_CONTENT_FIELDS = new Set(
  FORBIDDEN_BACKEND_CONTENT_FIELDS.map(normalizeFieldName)
);

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
      if (NORMALIZED_FORBIDDEN_BACKEND_CONTENT_FIELDS.has(normalizeFieldName(key))) {
        matches.add([...path, key].join("."));
      }
      visit(child, [...path, key]);
    }
  }
}

function normalizeFieldName(field: string) {
  return field.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function isTranscriptionLanguage(value: unknown): value is TranscriptionLanguage {
  return typeof value === "string" && (TRANSCRIPTION_LANGUAGES as readonly string[]).includes(value);
}

export function resolveTranscriptLanguage(
  requestedLanguage: TranscriptionLanguage,
  text: string,
  fallback: SupportedLanguage = "en"
): SupportedLanguage {
  if (requestedLanguage !== "auto") return requestedLanguage;
  return detectTranscriptLanguage(text, fallback);
}

export function detectTranscriptLanguage(text: string, fallback: SupportedLanguage = "en"): SupportedLanguage {
  const sample = text.trim();
  if (!sample) return fallback;
  if (/[\u3040-\u30ff]/u.test(sample)) return "ja";
  if (/[\u3400-\u9fff]/u.test(sample)) return "zh";
  if (/[ăâđêôơưÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬĐÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/u.test(sample)) return "vi";
  if (/[äöüßÄÖÜ]/u.test(sample)) return "de";
  if (/[ñÑ¡¿]/u.test(sample)) return "es";
  if (/[çœæÇŒÆ]/u.test(sample)) return "fr";
  return fallback;
}

export function estimateWordCount(text: string, language: TranscriptionLanguage): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const effectiveLanguage = resolveTranscriptLanguage(language, trimmed);
  if (effectiveLanguage === "zh" || effectiveLanguage === "ja") {
    return [...trimmed.replace(/\s+/g, "")].length;
  }
  return trimmed.split(/\s+/).filter(Boolean).length;
}
