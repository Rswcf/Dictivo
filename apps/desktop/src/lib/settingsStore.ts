import { SUPPORTED_LANGUAGES, type DictionaryTerm, type InputMode, type Snippet, type SupportedLanguage } from "@dictivo/shared";

const STORAGE_KEY = "dictivo-settings-v4";
const LEGACY_KEYS = ["dictivo-settings-v3", "dictivo-settings-v2", "dictivo-settings"];
const INPUT_MODES = ["dictation", "email", "message", "raw", "prompt"] as const satisfies readonly InputMode[];
const SELECTABLE_TIERS = ["fast", "medium", "slow"] as const satisfies readonly Settings["selectedTier"][];
const COMPANION_AVATARS = ["dog", "cat", "iris", "marcus", "custom"] as const satisfies readonly CompanionAvatar[];
// Legacy avatar IDs that earlier internal builds shipped. We migrate them to
// the current professional naming so beta users do not silently lose their
// selection on first launch after 0.2.1. "trump" is intentionally absent —
// it was a brand-risk removal, not a rename, and falls back to the default.
const LEGACY_AVATAR_MIGRATIONS: Record<string, CompanionAvatar> = {
  bikini: "iris",
  muscle: "marcus"
};
const LEGACY_CREATED_AT = "1970-01-01T00:00:00.000Z";
export const CUSTOM_COMPANION_AVATAR_MAX_BYTES = 1_500_000;
const CUSTOM_COMPANION_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export type CompanionAvatar = "dog" | "cat" | "iris" | "marcus" | "custom";

export type CustomCompanionAvatar = {
  dataUrl: string;
  name: string;
  updatedAt: string;
};

/**
 * User-chosen on-screen position for the floating companion window. Stored
 * in physical pixels because Tauri's setPosition + outerPosition both work
 * in physical pixels on macOS. `null` means "no override; use the default
 * top-right corner anchor".
 */
export type CompanionPosition = {
  x: number;
  y: number;
};

export type HotkeySettings = {
  dictation: string;
  pasteLast: string;
  activationMode: "toggle" | "hold";
};

export type LocalProcessingSettings = {
  autoPolish: boolean;
  spokenPunctuation: boolean;
  fillerWords: boolean;
  smartCapitalization: boolean;
};

export const DEFAULT_HOTKEYS: HotkeySettings = {
  dictation: "CommandOrControl+Shift+Space",
  pasteLast: "CommandOrControl+Shift+V",
  activationMode: "toggle"
};

export const DEFAULT_LOCAL_PROCESSING: LocalProcessingSettings = {
  autoPolish: true,
  spokenPunctuation: true,
  fillerWords: true,
  smartCapitalization: true
};

export type Settings = {
  language: SupportedLanguage;
  selectedMode: InputMode;
  selectedTier: "fast" | "medium" | "slow";
  onboardingCompleted: boolean;
  companionEnabled: boolean;
  companionAvatar: CompanionAvatar;
  customCompanionAvatar: CustomCompanionAvatar | null;
  companionPosition: CompanionPosition | null;
  hotkeys: HotkeySettings;
  localProcessing: LocalProcessingSettings;
  dictionary: DictionaryTerm[];
  snippets: Snippet[];
};

const DEFAULTS: Settings = {
  language: "en",
  selectedMode: "message",
  selectedTier: "medium",
  onboardingCompleted: false,
  companionEnabled: true,
  companionAvatar: "dog",
  customCompanionAvatar: null,
  companionPosition: null,
  hotkeys: DEFAULT_HOTKEYS,
  localProcessing: DEFAULT_LOCAL_PROCESSING,
  dictionary: [],
  snippets: []
};

export function normalizeHotkeys(value: Partial<HotkeySettings> | undefined): HotkeySettings {
  const dictation = safeShortcut(value?.dictation, DEFAULT_HOTKEYS.dictation);
  const fallbackPasteLast = shortcutsConflict(dictation, DEFAULT_HOTKEYS.pasteLast) ? "" : DEFAULT_HOTKEYS.pasteLast;
  const pasteLast = safeShortcut(value?.pasteLast, fallbackPasteLast);

  return {
    dictation,
    pasteLast: shortcutsConflict(dictation, pasteLast) ? fallbackPasteLast : pasteLast,
    activationMode: isOneOf(value?.activationMode, ["toggle", "hold"] as const) ? value.activationMode : DEFAULT_HOTKEYS.activationMode
  };
}

export function normalizeLocalProcessing(
  value: Partial<LocalProcessingSettings> | undefined
): LocalProcessingSettings {
  return {
    autoPolish: booleanOrDefault(value?.autoPolish, DEFAULT_LOCAL_PROCESSING.autoPolish),
    spokenPunctuation: booleanOrDefault(value?.spokenPunctuation, DEFAULT_LOCAL_PROCESSING.spokenPunctuation),
    fillerWords: booleanOrDefault(value?.fillerWords, DEFAULT_LOCAL_PROCESSING.fillerWords),
    smartCapitalization: booleanOrDefault(value?.smartCapitalization, DEFAULT_LOCAL_PROCESSING.smartCapitalization)
  };
}

function profileToTier(profile: unknown): Settings["selectedTier"] {
  if (profile === "fast") return "fast";
  if (profile === "quality") return "slow";
  return "medium";
}

export function loadSettings(): Settings {
  if (typeof localStorage === "undefined") return DEFAULTS;
  try {
    const fresh = localStorage.getItem(STORAGE_KEY);
    if (fresh) return normalizeSettings(JSON.parse(fresh), false);

    for (const key of LEGACY_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      return normalizeSettings(JSON.parse(raw), true);
    }
  } catch (error) {
    console.warn("settingsStore: load failed, using defaults", error);
  }
  return DEFAULTS;
}

export function saveSettings(settings: Settings) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
  } catch (error) {
    console.warn("settingsStore: save failed", error);
  }
}

function normalizeSettings(value: unknown, legacy: boolean): Settings {
  if (!value || typeof value !== "object") return DEFAULTS;
  const parsed = value as Record<string, unknown>;
  const language = isOneOf(parsed.language, SUPPORTED_LANGUAGES) ? parsed.language : DEFAULTS.language;
  const selectedTier = isOneOf(parsed.selectedTier, SELECTABLE_TIERS)
    ? parsed.selectedTier
    : legacy
      ? profileToTier(parsed.privateFastProfile)
      : DEFAULTS.selectedTier;
  const customCompanionAvatar = normalizeCustomCompanionAvatar(parsed.customCompanionAvatar);
  const rawCompanionAvatar = typeof parsed.companionAvatar === "string" ? parsed.companionAvatar : "";
  const migratedCompanionAvatar = LEGACY_AVATAR_MIGRATIONS[rawCompanionAvatar];
  const companionAvatar: CompanionAvatar = migratedCompanionAvatar
    ?? (isOneOf(parsed.companionAvatar, COMPANION_AVATARS)
      ? parsed.companionAvatar
      : DEFAULTS.companionAvatar);

  return {
    ...DEFAULTS,
    language,
    selectedMode: isOneOf(parsed.selectedMode, INPUT_MODES) ? parsed.selectedMode : DEFAULTS.selectedMode,
    selectedTier,
    onboardingCompleted: booleanOrDefault(parsed.onboardingCompleted, DEFAULTS.onboardingCompleted),
    companionEnabled: booleanOrDefault(parsed.companionEnabled, DEFAULTS.companionEnabled),
    companionAvatar: companionAvatar === "custom" && !customCompanionAvatar ? DEFAULTS.companionAvatar : companionAvatar,
    customCompanionAvatar,
    companionPosition: normalizeCompanionPosition(parsed.companionPosition),
    hotkeys: normalizeHotkeys(parsed.hotkeys as Partial<HotkeySettings> | undefined),
    localProcessing: normalizeLocalProcessing(
      parsed.localProcessing as Partial<LocalProcessingSettings> | undefined
    ),
    dictionary: normalizeDictionaryTerms(parsed.dictionary, language),
    snippets: normalizeSnippets(parsed.snippets, language)
  };
}

export async function readCustomCompanionAvatar(file: File): Promise<CustomCompanionAvatar> {
  validateCustomCompanionAvatarFile(file);
  const dataUrl = await readFileAsDataUrl(file);
  const normalized = normalizeCustomCompanionAvatar({
    dataUrl,
    name: file.name,
    updatedAt: new Date().toISOString()
  });

  if (!normalized) throw new Error("Choose a PNG, JPG, WebP, or GIF image under 1.5 MB.");
  return normalized;
}

export function validateCustomCompanionAvatarFile(file: Pick<File, "size" | "type">) {
  if (file.size > CUSTOM_COMPANION_AVATAR_MAX_BYTES) {
    throw new Error("Choose an image under 1.5 MB.");
  }
  if (!CUSTOM_COMPANION_AVATAR_TYPES.includes(file.type as (typeof CUSTOM_COMPANION_AVATAR_TYPES)[number])) {
    throw new Error("Choose a PNG, JPG, WebP, or GIF image.");
  }
}

function normalizeCompanionPosition(value: unknown): CompanionPosition | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Record<string, unknown>;
  const x = typeof parsed.x === "number" && Number.isFinite(parsed.x) ? parsed.x : null;
  const y = typeof parsed.y === "number" && Number.isFinite(parsed.y) ? parsed.y : null;
  if (x === null || y === null) return null;
  // Loosely sanity-check the values so absurd numbers (corrupted storage,
  // off-screen monitor that no longer exists) fall back to the auto-anchor.
  if (Math.abs(x) > 20_000 || Math.abs(y) > 20_000) return null;
  return { x: Math.round(x), y: Math.round(y) };
}

function normalizeCustomCompanionAvatar(value: unknown): CustomCompanionAvatar | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Record<string, unknown>;
  const dataUrl = typeof parsed.dataUrl === "string" ? parsed.dataUrl.trim() : "";
  if (!isSupportedAvatarDataUrl(dataUrl) || dataUrl.length > dataUrlLengthLimit()) return null;

  return {
    dataUrl,
    name: nonEmptyStringOr(parsed.name, "Custom avatar"),
    updatedAt: nonEmptyStringOr(parsed.updatedAt, LEGACY_CREATED_AT)
  };
}

function isSupportedAvatarDataUrl(value: string) {
  return /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(value);
}

function dataUrlLengthLimit() {
  return Math.ceil(CUSTOM_COMPANION_AVATAR_MAX_BYTES * 1.4) + 64;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Unable to read avatar image."));
      }
    });
    reader.addEventListener("error", () => reject(new Error("Unable to read avatar image.")));
    reader.readAsDataURL(file);
  });
}

function booleanOrDefault(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function safeShortcut(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const shortcut = value.trim();
  if (!shortcut) return "";
  return isGlobalSafeShortcut(shortcut) ? shortcut : fallback;
}

function isGlobalSafeShortcut(shortcut: string) {
  const parts = shortcut.split("+").map((part) => part.trim()).filter(Boolean);
  const hasPrimaryModifier = parts.some((part) => PRIMARY_SHORTCUT_MODIFIERS.has(normalizeShortcutPart(part)));
  const hasKey = parts.some((part) => !SHORTCUT_MODIFIERS.has(normalizeShortcutPart(part)));
  return hasPrimaryModifier && hasKey;
}

const SHORTCUT_MODIFIERS = new Set([
  "commandorcontrol",
  "commandorctrl",
  "cmdorcontrol",
  "cmdorctrl",
  "primary",
  "mod",
  "command",
  "cmd",
  "meta",
  "super",
  "control",
  "ctrl",
  "ctl",
  "alt",
  "option",
  "opt",
  "shift"
]);

const PRIMARY_SHORTCUT_MODIFIERS = new Set([
  "commandorcontrol",
  "commandorctrl",
  "cmdorcontrol",
  "cmdorctrl",
  "primary",
  "mod",
  "command",
  "cmd",
  "meta",
  "super",
  "control",
  "ctrl",
  "ctl",
  "alt",
  "option",
  "opt"
]);

function shortcutsConflict(left: string, right: string) {
  if (!left.trim() || !right.trim()) return false;
  const leftParsed = parseShortcut(left);
  const rightParsed = parseShortcut(right);
  if (!leftParsed.key || !rightParsed.key || leftParsed.key !== rightParsed.key) return false;
  return modifierOptions(leftParsed.modifiers).some((leftOption) =>
    modifierOptions(rightParsed.modifiers).some((rightOption) => sameModifierSet(leftOption, rightOption))
  );
}

function parseShortcut(shortcut: string) {
  const modifiers = new Set<string>();
  const keyParts: string[] = [];

  for (const part of shortcut.split("+").map((value) => value.trim()).filter(Boolean)) {
    const normalized = normalizeShortcutPart(part);
    const modifier = normalizeShortcutModifier(normalized);
    if (modifier) {
      modifiers.add(modifier);
    } else {
      keyParts.push(normalizeShortcutKey(normalized));
    }
  }

  return { modifiers, key: keyParts.join("+") };
}

function normalizeShortcutPart(value: string) {
  return value.toLowerCase().replace(/[\s_-]/g, "");
}

function normalizeShortcutModifier(value: string) {
  if (["commandorcontrol", "commandorctrl", "cmdorcontrol", "cmdorctrl", "primary", "mod"].includes(value)) return "primary";
  if (["command", "cmd", "meta", "super"].includes(value)) return "command";
  if (["control", "ctrl", "ctl"].includes(value)) return "control";
  if (["alt", "option", "opt"].includes(value)) return "alt";
  if (value === "shift") return "shift";
  return "";
}

function normalizeShortcutKey(value: string) {
  if (value === "spacebar") return "space";
  if (value === "esc") return "escape";
  if (value === "return") return "enter";
  if (value.startsWith("key") && value.length === 4) return value.slice(3);
  return value;
}

function modifierOptions(modifiers: Set<string>) {
  if (!modifiers.has("primary")) return [new Set(modifiers)];

  const base = new Set(modifiers);
  base.delete("primary");
  return [new Set([...base, "command"]), new Set([...base, "control"])];
}

function sameModifierSet(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) return false;
  return Array.from(left).every((modifier) => right.has(modifier));
}

function normalizeDictionaryTerms(value: unknown, fallbackLanguage: SupportedLanguage): DictionaryTerm[] {
  if (!Array.isArray(value)) return DEFAULTS.dictionary;

  const seen = new Set<string>();
  const terms: DictionaryTerm[] = [];

  value.forEach((item, index) => {
    const normalized = normalizeDictionaryTerm(item, index, fallbackLanguage);
    if (!normalized) return;
    const dedupeKey = `${normalized.language}:${normalized.value.trim().toLocaleLowerCase()}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    terms.push(normalized);
  });

  return terms;
}

function normalizeDictionaryTerm(
  value: unknown,
  index: number,
  fallbackLanguage: SupportedLanguage
): DictionaryTerm | null {
  if (typeof value === "string") {
    const term = value.trim();
    if (!term) return null;
    return {
      id: `legacy-term-${index}`,
      value: term,
      language: fallbackLanguage,
      createdAt: LEGACY_CREATED_AT
    };
  }

  if (!value || typeof value !== "object") return null;
  const parsed = value as Record<string, unknown>;
  const term = typeof parsed.value === "string" ? parsed.value.trim() : "";
  if (!term) return null;

  return {
    id: nonEmptyStringOr(parsed.id, `legacy-term-${index}`),
    value: term,
    language: isOneOf(parsed.language, SUPPORTED_LANGUAGES) ? parsed.language : fallbackLanguage,
    createdAt: nonEmptyStringOr(parsed.createdAt, LEGACY_CREATED_AT)
  };
}

function normalizeSnippets(value: unknown, fallbackLanguage: SupportedLanguage): Snippet[] {
  if (!Array.isArray(value)) return DEFAULTS.snippets;

  const seen = new Set<string>();
  const snippets: Snippet[] = [];

  value.forEach((item, index) => {
    const normalized = normalizeSnippet(item, index, fallbackLanguage);
    if (!normalized) return;
    const dedupeKey = `${normalized.language}:${normalized.trigger.trim().toLocaleLowerCase()}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    snippets.push(normalized);
  });

  return snippets;
}

function normalizeSnippet(value: unknown, index: number, fallbackLanguage: SupportedLanguage): Snippet | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Record<string, unknown>;
  const trigger = typeof parsed.trigger === "string" ? parsed.trigger.trim() : "";
  const replacement = typeof parsed.replacement === "string" ? parsed.replacement.trim() : "";
  if (!trigger || !replacement) return null;

  return {
    id: nonEmptyStringOr(parsed.id, `legacy-snippet-${index}`),
    trigger,
    replacement,
    language: isOneOf(parsed.language, SUPPORTED_LANGUAGES) ? parsed.language : fallbackLanguage,
    createdAt: nonEmptyStringOr(parsed.createdAt, LEGACY_CREATED_AT)
  };
}

function nonEmptyStringOr(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function isOneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === "string" && (choices as readonly string[]).includes(value);
}
