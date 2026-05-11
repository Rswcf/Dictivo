import type {
  DictionaryTerm,
  InputMode,
  Snippet,
  SupportedLanguage
} from "@dictivo/shared";

export type PrivateFastProfile = "fast" | "balanced" | "quality";
export type DictationActivationMode = "toggle" | "hold";
export type ModelSelectionMode = "auto" | "manual";

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

export const DEFAULT_HOTKEYS: HotkeySettings = {
  dictation: "Alt+Space",
  pasteLast: "Alt+Shift+V",
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
    dictation: settings?.dictation?.trim() || DEFAULT_HOTKEYS.dictation,
    pasteLast: settings?.pasteLast?.trim() || DEFAULT_HOTKEYS.pasteLast,
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
  migrated.hotkeys = normalizeHotkeys(isRecord(raw.hotkeys) ? raw.hotkeys : undefined);
  migrated.localProcessing = normalizeLocalProcessing(isRecord(raw.localProcessing) ? raw.localProcessing : undefined);

  if (Array.isArray(raw.dictionary)) migrated.dictionary = raw.dictionary as DictionaryTerm[];
  if (Array.isArray(raw.snippets)) migrated.snippets = raw.snippets as Snippet[];

  return migrated;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
