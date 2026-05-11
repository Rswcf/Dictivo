import type {
  DictionaryTerm,
  InputMode,
  Snippet,
  SupportedLanguage
} from "@dictivo/shared";

export type PrivateFastProfile = "fast" | "balanced" | "quality";
export type DictationActivationMode = "toggle" | "hold";
export type ModelSelectionMode = "auto" | "manual";
export type CompanionAvatar = "dog" | "cat" | "trump";

export type HotkeySettings = {
  dictation: string;
  pasteLast: string;
  activationMode: DictationActivationMode;
};

export type LocalProcessingSettings = {
  autoPolish: boolean;
  spokenPunctuation: boolean;
  fillerWords: boolean;
  smartCapitalization: boolean;
};

const LEGACY_DEFAULT_HOTKEYS: HotkeySettings = {
  dictation: "Alt+Space",
  pasteLast: "Alt+Shift+V",
  activationMode: "toggle"
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

export type PersistedSettings = {
  language: SupportedLanguage;
  selectedMode: InputMode;
  privateFastProfile: PrivateFastProfile;
  modelSelectionMode: ModelSelectionMode;
  companionEnabled: boolean;
  companionAvatar: CompanionAvatar;
  hotkeys: HotkeySettings;
  localProcessing: LocalProcessingSettings;
  dictionary: DictionaryTerm[];
  snippets: Snippet[];
};

const settingsKey = "dictivo-settings-v3-local";
const legacySettingsKeys = ["dictivo-settings-v2"];
const supportedLanguages = new Set(["en", "zh", "es", "ja", "fr", "de"]);
const supportedModes = new Set(["dictation", "email", "message", "raw", "prompt"]);

export function loadSettings(): Partial<PersistedSettings> {
  const raw = localStorage.getItem(settingsKey) ?? legacySettingsKeys.map((key) => localStorage.getItem(key)).find(Boolean);
  if (!raw) return {};

  try {
    return migratePersistedSettings(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return {};
  }
}

export function saveSettings(settings: PersistedSettings) {
  localStorage.setItem(settingsKey, JSON.stringify(settings));
}

export function normalizeHotkeys(settings?: Partial<HotkeySettings>): HotkeySettings {
  return {
    dictation: normalizeShortcut(settings?.dictation, DEFAULT_HOTKEYS.dictation, LEGACY_DEFAULT_HOTKEYS.dictation),
    pasteLast: normalizeShortcut(settings?.pasteLast, DEFAULT_HOTKEYS.pasteLast, LEGACY_DEFAULT_HOTKEYS.pasteLast),
    activationMode: settings?.activationMode === "hold" ? "hold" : "toggle"
  };
}

export function normalizeLocalProcessing(settings?: Partial<LocalProcessingSettings>): LocalProcessingSettings {
  return {
    ...DEFAULT_LOCAL_PROCESSING,
    ...settings
  };
}

export function normalizePrivateFastProfile(value: unknown): PrivateFastProfile {
  return value === "fast" || value === "balanced" || value === "quality" ? value : "balanced";
}

export function normalizeModelSelectionMode(value: unknown): ModelSelectionMode {
  return value === "manual" ? "manual" : "auto";
}

export function normalizeCompanionAvatar(value: unknown): CompanionAvatar {
  return value === "dog" || value === "cat" || value === "trump" ? value : "dog";
}

export function migratePersistedSettings(raw: Record<string, unknown>): Partial<PersistedSettings> {
  const migrated: Partial<PersistedSettings> = {};

  if (typeof raw.language === "string" && supportedLanguages.has(raw.language)) {
    migrated.language = raw.language as SupportedLanguage;
  }

  if (typeof raw.selectedMode === "string" && supportedModes.has(raw.selectedMode)) {
    migrated.selectedMode = raw.selectedMode as InputMode;
  }

  migrated.privateFastProfile = normalizePrivateFastProfile(raw.privateFastProfile);
  migrated.modelSelectionMode = normalizeModelSelectionMode(raw.modelSelectionMode);
  migrated.companionEnabled = typeof raw.companionEnabled === "boolean" ? raw.companionEnabled : true;
  migrated.companionAvatar = normalizeCompanionAvatar(raw.companionAvatar);
  migrated.hotkeys = normalizeHotkeys(isRecord(raw.hotkeys) ? raw.hotkeys : undefined);
  migrated.localProcessing = normalizeLocalProcessing(isRecord(raw.localProcessing) ? raw.localProcessing : undefined);

  if (Array.isArray(raw.dictionary)) migrated.dictionary = raw.dictionary as DictionaryTerm[];
  if (Array.isArray(raw.snippets)) migrated.snippets = raw.snippets as Snippet[];

  return migrated;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeShortcut(value: unknown, fallback: string, legacyFallback: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed || trimmed === legacyFallback) return fallback;
  return trimmed;
}
