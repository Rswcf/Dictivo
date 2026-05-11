import type { ShortcutEvent } from "@tauri-apps/plugin-global-shortcut";

export function isShortcutPress(event: Pick<ShortcutEvent, "state">) {
  return event.state === "Pressed";
}

export function uniqueShortcuts(shortcuts: string[]) {
  return Array.from(new Set(shortcuts.map((shortcut) => shortcut.trim()).filter(Boolean)));
}
