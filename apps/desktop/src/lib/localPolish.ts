import type { FinalizeTranscriptOptions, SupportedLanguage } from "@dictivo/shared";
import type { LocalProcessingSettings } from "./settingsStore";

type LocalPolishOptions = FinalizeTranscriptOptions & {
  processing: LocalProcessingSettings;
};

const englishSpokenPunctuation: Array<[RegExp, string]> = [
  [/\bnew paragraph\b/gi, "\n\n"],
  [/\bnew line\b/gi, "\n"],
  [/\bcomma\b/gi, ","],
  [/\bperiod\b/gi, "."],
  [/\bfull stop\b/gi, "."],
  [/\bquestion mark\b/gi, "?"],
  [/\bexclamation mark\b/gi, "!"],
  [/\bcolon\b/gi, ":"],
  [/\bsemicolon\b/gi, ";"],
  [/\bdash\b/gi, "-"]
];

const localizedSpokenPunctuation: Partial<Record<SupportedLanguage, Array<[RegExp, string]>>> = {
  zh: [
    [/换行/g, "\n"],
    [/新段落/g, "\n\n"],
    [/逗号/g, "，"],
    [/句号/g, "。"],
    [/问号/g, "？"],
    [/感叹号/g, "！"],
    [/冒号/g, "："]
  ],
  ja: [
    [/改行/g, "\n"],
    [/句点/g, "。"],
    [/読点/g, "、"],
    [/疑問符/g, "？"]
  ]
};

export function polishLocalTranscript(text: string, options: LocalPolishOptions) {
  const raw = text.trim();
  if (!raw || options.mode === "raw" || !options.processing.autoPolish) {
    return applySnippets(raw, options.snippets);
  }

  let current = raw;
  if (options.processing.spokenPunctuation) current = applySpokenPunctuation(current, options.language);
  if (options.processing.fillerWords) current = removeFillerWords(current, options.language);
  current = normalizeWhitespace(current, options.language);
  current = normalizePunctuation(current, options.language);
  if (options.processing.smartCapitalization) current = smartCapitalize(current, options.language, options.dictionary);
  current = applyModeFormat(current, options);
  current = applySnippets(current, options.snippets);
  return current.trim();
}

function applySnippets(text: string, snippets: LocalPolishOptions["snippets"]) {
  return snippets.reduce((current, snippet) => {
    const trigger = escapeRegExp(snippet.trigger.trim());
    if (!trigger) return current;
    return current.replace(new RegExp(`\\b${trigger}\\b`, "gi"), snippet.replacement);
  }, text);
}

function applySpokenPunctuation(text: string, language: SupportedLanguage) {
  const replacements = [...englishSpokenPunctuation, ...(localizedSpokenPunctuation[language] ?? [])];
  return replacements.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text);
}

function removeFillerWords(text: string, language: SupportedLanguage) {
  if (language === "zh") {
    return text.replace(/(^|\s)(嗯|呃|那个|就是|然后)(?=\s|，|。|$)/g, "$1");
  }
  if (language === "ja") {
    return text.replace(/(^|\s)(えっと|あの|その)(?=\s|、|。|$)/g, "$1");
  }
  return text
    .replace(/\b(um+|uh+|erm|ah)\b[,\s]*/gi, "")
    .replace(/\bkind of\b[,\s]*/gi, "")
    .replace(/\byou know\b[,\s]*/gi, "")
    .replace(/\bi mean\b[,\s]*/gi, "");
}

function normalizeWhitespace(text: string, language: SupportedLanguage) {
  if (language === "zh" || language === "ja") {
    return text
      .replace(/[ \t]+/g, " ")
      .replace(/\s+([，。！？、：；])/g, "$1")
      .replace(/([，。！？、：；])\s+/g, "$1")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/([,.!?;:])(?=\S)/g, "$1 ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizePunctuation(text: string, language: SupportedLanguage) {
  if (language === "zh" || language === "ja") {
    return ensureEndingPunctuation(text, language === "ja" ? "。" : "。");
  }

  let current = text
    .replace(/,{2,}/g, ",")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+'\s*/g, "'")
    .replace(/\bi\b/g, "I");
  current = ensureEndingPunctuation(current, ".");
  return current;
}

function smartCapitalize(text: string, language: SupportedLanguage, dictionary: string[]) {
  if (language === "zh" || language === "ja") return text;

  let current = text;
  current = current.replace(/(^|[.!?]\s+)([a-z])/g, (_match, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
  current = current.replace(/\b(i|i'm|i'll|i'd|i've)\b/gi, (match) => match[0]!.toUpperCase() + match.slice(1));

  for (const term of dictionary) {
    const trimmed = term.trim();
    if (!trimmed) continue;
    current = current.replace(new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, "gi"), trimmed);
  }

  return current;
}

function applyModeFormat(text: string, options: LocalPolishOptions) {
  if (options.mode === "prompt") {
    return `Context:\n${text}\n\nTask:\n`;
  }

  if (options.mode === "email") {
    return text
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .join("\n\n");
  }

  return text;
}

function ensureEndingPunctuation(text: string, fallback: string) {
  const trimmed = text.trim();
  if (!trimmed || /[.!?。！？]$/.test(trimmed)) return trimmed;
  return `${trimmed}${fallback}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
