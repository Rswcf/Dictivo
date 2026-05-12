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
      hotkeys: { dictation: "CommandOrControl+Shift+Space", pasteLast: "", activationMode: "toggle" },
      localProcessing: { autoPolish: true, spokenPunctuation: true, fillerWords: true, smartCapitalization: true },
      dictionary: [],
      snippets: []
    });
    expect(loadSettings().selectedTier).toBe("fast");
    expect(loadSettings().onboardingCompleted).toBe(true);
  });
});
