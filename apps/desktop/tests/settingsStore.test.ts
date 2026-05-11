import { describe, expect, it } from "vitest";
import { migratePersistedSettings, normalizeCompanionAvatar, normalizeHotkeys, normalizePrivateFastProfile } from "../src/lib/settingsStore";

describe("local-only settings migration", () => {
  it("drops legacy cloud provider settings and keeps local dictation preferences", () => {
    const migrated = migratePersistedSettings({
      language: "en",
      provider: "openai",
      privacyMode: "cloud-zero-retention",
      providerKeys: { openai: "sk-test" },
      selectedMode: "message",
      privateFastProfile: "quality",
      hotkeys: {
        dictation: "Alt+Space",
        meeting: "Alt+Shift+Space",
        pasteLast: "Alt+Shift+V",
        activationMode: "hold"
      }
    });

    expect(migrated).not.toHaveProperty("provider");
    expect(migrated).not.toHaveProperty("privacyMode");
    expect(migrated).not.toHaveProperty("providerKeys");
    expect(migrated.selectedMode).toBe("message");
    expect(migrated.privateFastProfile).toBe("quality");
    expect(migrated.hotkeys).toEqual({
      dictation: "CommandOrControl+Shift+Space",
      pasteLast: "CommandOrControl+Shift+V",
      activationMode: "hold"
    });
    expect(migrated.companionEnabled).toBe(true);
    expect(migrated.companionAvatar).toBe("dog");
  });

  it("normalizes the local profile and hotkey set", () => {
    expect(normalizePrivateFastProfile("cloud")).toBe("balanced");
    expect(normalizeHotkeys({ dictation: "", pasteLast: "Ctrl+Alt+V" })).toEqual({
      dictation: "CommandOrControl+Shift+Space",
      pasteLast: "Ctrl+Alt+V",
      activationMode: "toggle"
    });
  });

  it("preserves custom hotkeys while upgrading old default shortcuts", () => {
    expect(normalizeHotkeys({ dictation: "CommandOrControl+Alt+D", pasteLast: "Alt+Shift+V" })).toEqual({
      dictation: "CommandOrControl+Alt+D",
      pasteLast: "CommandOrControl+Shift+V",
      activationMode: "toggle"
    });
  });

  it("normalizes the floating companion avatar", () => {
    expect(normalizeCompanionAvatar("trump")).toBe("trump");
    expect(normalizeCompanionAvatar("horse")).toBe("dog");
  });
});
