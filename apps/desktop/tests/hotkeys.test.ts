import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isShortcutPress, shortcutMatches, uniqueShortcuts } from "../src/lib/hotkeys";

describe("global hotkey helpers", () => {
  it("handles shortcut press events once and ignores releases", () => {
    expect(isShortcutPress({ state: "Pressed" })).toBe(true);
    expect(isShortcutPress({ state: "Released" })).toBe(false);
  });

  it("removes empty and duplicate shortcut registrations", () => {
    expect(uniqueShortcuts([" CommandOrControl+Shift+Space ", "", "CmdOrCtrl+Shift+Space", "CommandOrControl+Shift+V"])).toEqual([
      "CommandOrControl+Shift+Space",
      "CommandOrControl+Shift+V"
    ]);
  });

  it("matches platform-normalized shortcut events against cross-platform settings", () => {
    expect(shortcutMatches("Command+Shift+Space", "CommandOrControl+Shift+Space")).toBe(true);
    expect(shortcutMatches("Control+Shift+Space", "CommandOrControl+Shift+Space")).toBe(true);
    expect(shortcutMatches("Ctrl+Shift+Space", "CmdOrCtrl+Shift+Space")).toBe(true);
    expect(shortcutMatches("Command+Shift+V", "CommandOrControl+Shift+Space")).toBe(false);
    expect(shortcutMatches("Command+Alt+Space", "CommandOrControl+Shift+Space")).toBe(false);
  });

  it("keeps Tauri global shortcut commands enabled", () => {
    const capability = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8")) as { permissions: string[] };

    expect(capability.permissions).toContain("global-shortcut:allow-register");
    expect(capability.permissions).toContain("global-shortcut:allow-unregister");
    expect(capability.permissions).toContain("global-shortcut:allow-is-registered");
  });
});
