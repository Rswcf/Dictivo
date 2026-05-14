import { describe, expect, it, beforeEach, vi } from "vitest";
import { loadSettings, saveSettings } from "../src/lib/settingsStore";

function createLocalStorage() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null
  };
}

describe("settingsStore v4 migration", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorage());
  });

  it("returns defaults when nothing stored", () => {
    const s = loadSettings();
    expect(s.selectedTier).toBe("medium");
    expect(s.onboardingCompleted).toBe(false);
  });

  it("migrates v3 privateFastProfile=balanced to selectedTier=medium", () => {
    localStorage.setItem(
      "dictivo-settings-v3",
      JSON.stringify({ privateFastProfile: "balanced", modelSelectionMode: "auto", language: "en" })
    );
    const s = loadSettings();
    expect(s.selectedTier).toBe("medium");
    expect(s.language).toBe("en");
  });

  it("migrates v3 privateFastProfile=fast to selectedTier=fast", () => {
    localStorage.setItem(
      "dictivo-settings-v3",
      JSON.stringify({ privateFastProfile: "fast" })
    );
    expect(loadSettings().selectedTier).toBe("fast");
  });

  it("migrates v3 privateFastProfile=quality to selectedTier=slow", () => {
    localStorage.setItem(
      "dictivo-settings-v3",
      JSON.stringify({ privateFastProfile: "quality" })
    );
    expect(loadSettings().selectedTier).toBe("slow");
  });

  it("round-trips through saveSettings", () => {
    saveSettings({
      language: "en",
      selectedMode: "message",
      selectedTier: "fast",
      onboardingCompleted: true,
      companionEnabled: true,
      companionAvatar: "cat",
      customCompanionAvatar: null,
      hotkeys: { dictation: "CommandOrControl+Shift+Space", pasteLast: "", activationMode: "toggle" },
      localProcessing: { autoPolish: true, spokenPunctuation: true, fillerWords: true, smartCapitalization: true },
      dictionary: [],
      snippets: []
    });
    expect(loadSettings().selectedTier).toBe("fast");
    expect(loadSettings().onboardingCompleted).toBe(true);
  });

  it("round-trips a local custom companion avatar", () => {
    const customCompanionAvatar = {
      dataUrl: "data:image/png;base64,YXZhdGFy",
      name: "avatar.png",
      updatedAt: "2026-05-13T00:00:00.000Z"
    };

    saveSettings({
      language: "en",
      selectedMode: "message",
      selectedTier: "medium",
      onboardingCompleted: true,
      companionEnabled: true,
      companionAvatar: "custom",
      customCompanionAvatar,
      hotkeys: { dictation: "CommandOrControl+Shift+Space", pasteLast: "CommandOrControl+Shift+V", activationMode: "toggle" },
      localProcessing: { autoPolish: true, spokenPunctuation: true, fillerWords: true, smartCapitalization: true },
      dictionary: [],
      snippets: []
    });

    expect(loadSettings()).toMatchObject({
      companionAvatar: "custom",
      customCompanionAvatar
    });
  });

  it("falls back to the default avatar when a stored custom avatar is invalid", () => {
    localStorage.setItem(
      "dictivo-settings-v4",
      JSON.stringify({
        companionAvatar: "custom",
        customCompanionAvatar: {
          dataUrl: "https://example.com/avatar.png",
          name: "remote.png",
          updatedAt: "2026-05-13T00:00:00.000Z"
        }
      })
    );

    expect(loadSettings()).toMatchObject({
      companionAvatar: "dog",
      customCompanionAvatar: null
    });
  });

  it("normalizes corrupted v4 settings instead of loading invalid UI state", () => {
    localStorage.setItem(
      "dictivo-settings-v4",
      JSON.stringify({
        language: "klingon",
        selectedMode: "telepathy",
        selectedTier: "large",
        onboardingCompleted: "yes",
        companionEnabled: "false",
        companionAvatar: "spaceship",
        hotkeys: { dictation: 123, pasteLast: null, activationMode: "press" },
        localProcessing: {
          autoPolish: "true",
          spokenPunctuation: false,
          fillerWords: null,
          smartCapitalization: true
        },
        dictionary: "not-array",
        snippets: "not-array"
      })
    );

    const settings = loadSettings();

    expect(settings).toMatchObject({
      language: "en",
      selectedMode: "message",
      selectedTier: "medium",
      onboardingCompleted: false,
      companionEnabled: true,
      companionAvatar: "dog",
      hotkeys: {
        dictation: "CommandOrControl+Shift+Space",
        pasteLast: "CommandOrControl+Shift+V",
        activationMode: "toggle"
      },
      localProcessing: {
        autoPolish: true,
        spokenPunctuation: false,
        fillerWords: true,
        smartCapitalization: true
      },
      dictionary: [],
      snippets: []
    });
  });

  it("migrates legacy avatar ids that were renamed in 0.2.1", () => {
    localStorage.setItem(
      "dictivo-settings-v4",
      JSON.stringify({ companionAvatar: "bikini", onboardingCompleted: true })
    );
    expect(loadSettings().companionAvatar).toBe("iris");

    localStorage.setItem(
      "dictivo-settings-v4",
      JSON.stringify({ companionAvatar: "muscle", onboardingCompleted: true })
    );
    expect(loadSettings().companionAvatar).toBe("marcus");
  });

  it("falls back to the default avatar when the stored id is unrecognised", () => {
    localStorage.setItem(
      "dictivo-settings-v4",
      JSON.stringify({ companionAvatar: "trump", onboardingCompleted: true })
    );
    expect(loadSettings().companionAvatar).toBe("dog");
  });

  it("sanitizes dictionary and snippet arrays from legacy or corrupted settings", () => {
    localStorage.setItem(
      "dictivo-settings-v4",
      JSON.stringify({
        language: "de",
        dictionary: [
          " Dictivo ",
          { id: "", value: "kubectl", language: "vi", createdAt: "" },
          { id: "duplicate", value: "dictivo", language: "en", createdAt: "2026-05-13" },
          { id: "empty", value: "   ", language: "en", createdAt: "2026-05-13" },
          { id: "bad-language", value: "Supabase", language: "klingon", createdAt: "2026-05-13" },
          null
        ],
        snippets: [
          { id: "", trigger: " calendar ", replacement: " https://cal.example ", language: "es", createdAt: "" },
          { id: "duplicate", trigger: "CALENDAR", replacement: "https://other.example", language: "en", createdAt: "2026-05-13" },
          { id: "missing-replacement", trigger: "empty", replacement: "", language: "en" },
          "not-a-snippet"
        ]
      })
    );

    const settings = loadSettings();

    expect(settings.dictionary).toEqual([
      {
        id: "legacy-term-0",
        value: "Dictivo",
        language: "de",
        createdAt: "1970-01-01T00:00:00.000Z"
      },
      {
        id: "legacy-term-1",
        value: "kubectl",
        language: "vi",
        createdAt: "1970-01-01T00:00:00.000Z"
      },
      {
        id: "duplicate",
        value: "dictivo",
        language: "en",
        createdAt: "2026-05-13"
      },
      {
        id: "bad-language",
        value: "Supabase",
        language: "de",
        createdAt: "2026-05-13"
      }
    ]);
    expect(settings.snippets).toEqual([
      {
        id: "legacy-snippet-0",
        trigger: "calendar",
        replacement: "https://cal.example",
        language: "es",
        createdAt: "1970-01-01T00:00:00.000Z"
      },
      {
        id: "duplicate",
        trigger: "CALENDAR",
        replacement: "https://other.example",
        language: "en",
        createdAt: "2026-05-13"
      }
    ]);
  });

  it("normalizes unsafe or duplicate stored hotkeys before registration", () => {
    localStorage.setItem(
      "dictivo-settings-v4",
      JSON.stringify({
        hotkeys: {
          dictation: "Shift+K",
          pasteLast: "CommandOrControl+Shift+Space",
          activationMode: "hold"
        }
      })
    );

    expect(loadSettings().hotkeys).toEqual({
      dictation: "CommandOrControl+Shift+Space",
      pasteLast: "CommandOrControl+Shift+V",
      activationMode: "hold"
    });

    localStorage.setItem(
      "dictivo-settings-v4",
      JSON.stringify({
        hotkeys: {
          dictation: "CommandOrControl+Shift+V",
          pasteLast: "Ctrl+Shift+V",
          activationMode: "toggle"
        }
      })
    );

    expect(loadSettings().hotkeys).toEqual({
      dictation: "CommandOrControl+Shift+V",
      pasteLast: "",
      activationMode: "toggle"
    });
  });
});
