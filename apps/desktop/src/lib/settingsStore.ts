import type { DictionaryTerm, InputMode, Snippet, SupportedLanguage } from "@dictivo/shared";

const STORAGE_KEY = "dictivo-settings-v4";
const LEGACY_KEYS = ["dictivo-settings-v3", "dictivo-settings-v2", "dictivo-settings"];

export type CompanionAvatar = "dog" | "cat" | "trump";

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
  hotkeys: DEFAULT_HOTKEYS,
  localProcessing: DEFAULT_LOCAL_PROCESSING,
  dictionary: [],
  snippets: []
};

export function normalizeHotkeys(value: Partial<HotkeySettings> | undefined): HotkeySettings {
  return {
    dictation: value?.dictation ?? DEFAULT_HOTKEYS.dictation,
    pasteLast: value?.pasteLast ?? DEFAULT_HOTKEYS.pasteLast,
    activationMode: value?.activationMode ?? DEFAULT_HOTKEYS.activationMode
  };
}

export function normalizeLocalProcessing(
  value: Partial<LocalProcessingSettings> | undefined
): LocalProcessingSettings {
  return {
    autoPolish: value?.autoPolish ?? DEFAULT_LOCAL_PROCESSING.autoPolish,
    spokenPunctuation: value?.spokenPunctuation ?? DEFAULT_LOCAL_PROCESSING.spokenPunctuation,
    fillerWords: value?.fillerWords ?? DEFAULT_LOCAL_PROCESSING.fillerWords,
    smartCapitalization: value?.smartCapitalization ?? DEFAULT_LOCAL_PROCESSING.smartCapitalization
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
    if (fresh) return { ...DEFAULTS, ...JSON.parse(fresh) };

    for (const key of LEGACY_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const migrated: Settings = {
        ...DEFAULTS,
        ...(parsed as Partial<Settings>),
        selectedTier: profileToTier(parsed.privateFastProfile),
        onboardingCompleted: Boolean(parsed.onboardingCompleted),
        hotkeys: normalizeHotkeys(parsed.hotkeys as Partial<HotkeySettings> | undefined),
        localProcessing: normalizeLocalProcessing(
          parsed.localProcessing as Partial<LocalProcessingSettings> | undefined
        )
      };
      return migrated;
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
