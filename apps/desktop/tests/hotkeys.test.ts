import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { formatShortcutForDisplay, isShortcutPress, resolveHotkeyIntent, shortcutMatches, uniqueShortcuts } from "../src/lib/hotkeys";

const hotkeys = {
  dictation: "CommandOrControl+Shift+Space",
  pasteLast: "CommandOrControl+Shift+V",
  activationMode: "toggle" as const
};

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

  it("formats settings shortcuts for compact workbench chips", () => {
    expect(formatShortcutForDisplay("Alt+Space", "macos")).toBe("⌥Space");
    expect(formatShortcutForDisplay("CommandOrControl+Alt+K", "macos")).toBe("⌘⌥K");
    expect(formatShortcutForDisplay("", "macos")).toBe("Unset");
  });

  it("formats cross-platform primary shortcuts with Windows/Linux labels", () => {
    expect(formatShortcutForDisplay("CommandOrControl+Shift+Space", "windows")).toBe("Ctrl+Shift+Space");
    expect(formatShortcutForDisplay("CommandOrControl+Alt+K", "windows")).toBe("Ctrl+Alt+K");
    expect(formatShortcutForDisplay("CommandOrControl+Shift+V", "linux")).toBe("Ctrl+Shift+V");
  });

  it("maps toggle dictation events to start and stop actions", () => {
    expect(resolveHotkeyIntent({ shortcut: "Command+Shift+Space", state: "Pressed" }, hotkeys, false)).toBe("start-dictation");
    expect(resolveHotkeyIntent({ shortcut: "Control+Shift+Space", state: "Pressed" }, hotkeys, true)).toBe("stop-dictation");
    expect(resolveHotkeyIntent({ shortcut: "Command+Shift+Space", state: "Released" }, hotkeys, true)).toBe("none");
  });

  it("maps hold dictation events to press-start and release-stop actions", () => {
    const holdHotkeys = { ...hotkeys, activationMode: "hold" as const };
    expect(resolveHotkeyIntent({ shortcut: "Command+Shift+Space", state: "Pressed" }, holdHotkeys, false)).toBe("start-dictation");
    expect(resolveHotkeyIntent({ shortcut: "Command+Shift+Space", state: "Released" }, holdHotkeys, true)).toBe("stop-dictation");
    expect(resolveHotkeyIntent({ shortcut: "Command+Shift+Space", state: "Released" }, holdHotkeys, false)).toBe("none");
  });

  it("maps paste-last events separately from dictation", () => {
    expect(resolveHotkeyIntent({ shortcut: "Control+Shift+V", state: "Pressed" }, hotkeys, false)).toBe("paste-last");
    expect(resolveHotkeyIntent({ shortcut: "Control+Shift+V", state: "Released" }, hotkeys, false)).toBe("none");
  });

  it("keeps Tauri global shortcut commands enabled", () => {
    const capability = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8")) as { permissions: string[] };

    expect(capability.permissions).toContain("global-shortcut:allow-register");
    expect(capability.permissions).toContain("global-shortcut:allow-unregister");
    expect(capability.permissions).toContain("global-shortcut:allow-is-registered");
  });

  it("does not ship the unused opener plugin or permission", () => {
    const capability = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8")) as { permissions: string[] };
    const cargoToml = readFileSync("src-tauri/Cargo.toml", "utf8");
    const libRs = readFileSync("src-tauri/src/lib.rs", "utf8");

    expect(capability.permissions.some((permission) => permission.startsWith("opener:"))).toBe(false);
    expect(cargoToml).not.toContain("tauri-plugin-opener");
    expect(libRs).not.toContain("tauri_plugin_opener");
  });
});
