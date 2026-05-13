import type { ShortcutEvent } from "@tauri-apps/plugin-global-shortcut";

type CanonicalModifier = "primary" | "command" | "control" | "alt" | "shift";

type ParsedShortcut = {
  modifiers: Set<CanonicalModifier>;
  key: string;
};

export type ShortcutDisplayPlatform = "macos" | "windows" | "linux" | "web";

export type HotkeyIntent = "start-dictation" | "stop-dictation" | "paste-last" | "none";

type HotkeyConfig = {
  dictation: string;
  pasteLast: string;
  activationMode: "toggle" | "hold";
};

export function isShortcutPress(event: Pick<ShortcutEvent, "state">) {
  return event.state === "Pressed";
}

export function uniqueShortcuts(shortcuts: string[]) {
  const seen = new Set<string>();
  const unique = [];

  for (const shortcut of shortcuts.map((value) => value.trim()).filter(Boolean)) {
    const fingerprint = shortcutFingerprint(shortcut);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    unique.push(shortcut);
  }

  return unique;
}

export function formatShortcutForDisplay(shortcut: string, platform?: ShortcutDisplayPlatform | null) {
  const displayPlatform = resolveShortcutDisplayPlatform(platform);
  const tokens = shortcut
    .split("+")
    .map((part) => formatShortcutToken(part.trim(), displayPlatform))
    .filter(Boolean);
  return tokens.join(displayPlatform === "macos" ? "" : "+") || "Unset";
}

export function shortcutMatches(actual: string, expected: string) {
  const actualShortcut = parseShortcut(actual);
  const expectedShortcut = parseShortcut(expected);
  if (!actualShortcut.key || !expectedShortcut.key) return false;
  if (actualShortcut.key !== expectedShortcut.key) return false;

  return modifierOptions(actualShortcut.modifiers).some((actualOption) =>
    modifierOptions(expectedShortcut.modifiers).some((expectedOption) => sameModifierSet(actualOption, expectedOption))
  );
}

export function shortcutFingerprint(shortcut: string) {
  const parsed = parseShortcut(shortcut);
  return `${Array.from(parsed.modifiers).sort().join("+")}::${parsed.key}`;
}

export function resolveHotkeyIntent(
  event: Pick<ShortcutEvent, "shortcut" | "state">,
  hotkeys: HotkeyConfig,
  isDictating: boolean
): HotkeyIntent {
  if (shortcutMatches(event.shortcut, hotkeys.dictation)) {
    if (hotkeys.activationMode === "hold") {
      if (isShortcutPress(event) && !isDictating) return "start-dictation";
      if (event.state === "Released" && isDictating) return "stop-dictation";
      return "none";
    }

    if (!isShortcutPress(event)) return "none";
    return isDictating ? "stop-dictation" : "start-dictation";
  }

  if (isShortcutPress(event) && shortcutMatches(event.shortcut, hotkeys.pasteLast)) return "paste-last";

  return "none";
}

function resolveShortcutDisplayPlatform(platform?: ShortcutDisplayPlatform | null): Exclude<ShortcutDisplayPlatform, "web"> {
  if (platform === "macos" || platform === "windows" || platform === "linux") return platform;

  const navigatorPlatform =
    typeof navigator === "undefined"
      ? ""
      : (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
        navigator.platform ||
        navigator.userAgent ||
        "";
  if (/win/i.test(navigatorPlatform)) return "windows";
  if (/linux|x11/i.test(navigatorPlatform)) return "linux";
  return "macos";
}

function formatShortcutToken(value: string, platform: Exclude<ShortcutDisplayPlatform, "web">) {
  const normalized = value.toLowerCase().replace(/[\s_-]/g, "");
  if (["commandorcontrol", "commandorctrl", "cmdorcontrol", "cmdorctrl", "primary", "mod"].includes(normalized)) {
    return platform === "macos" ? "⌘" : "Ctrl";
  }
  if (["command", "cmd", "meta", "super"].includes(normalized)) return platform === "macos" ? "⌘" : "Win";
  if (["control", "ctrl", "ctl"].includes(normalized)) return platform === "macos" ? "⌃" : "Ctrl";
  if (["alt", "option", "opt"].includes(normalized)) return platform === "macos" ? "⌥" : "Alt";
  if (normalized === "shift") return platform === "macos" ? "⇧" : "Shift";
  if (normalized === "space" || normalized === "spacebar") return "Space";
  if (normalized === "escape" || normalized === "esc") return "Esc";
  if (normalized === "return") return "Enter";
  if (value.length === 1) return value.toUpperCase();
  return value;
}

function parseShortcut(shortcut: string): ParsedShortcut {
  const modifiers = new Set<CanonicalModifier>();
  const keyParts = [];

  for (const rawPart of shortcut.split("+")) {
    const part = rawPart.trim();
    if (!part) continue;

    const modifier = normalizeModifier(part);
    if (modifier) {
      modifiers.add(modifier);
      continue;
    }

    keyParts.push(normalizeKey(part));
  }

  return {
    modifiers,
    key: keyParts.join("+")
  };
}

function normalizeModifier(value: string): CanonicalModifier | undefined {
  const normalized = value.toLowerCase().replace(/[\s_-]/g, "");
  if (["commandorcontrol", "commandorctrl", "cmdorcontrol", "cmdorctrl", "primary", "mod"].includes(normalized)) return "primary";
  if (["command", "cmd", "meta", "super"].includes(normalized)) return "command";
  if (["control", "ctrl", "ctl"].includes(normalized)) return "control";
  if (["alt", "option", "opt"].includes(normalized)) return "alt";
  if (normalized === "shift") return "shift";
  return undefined;
}

function normalizeKey(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === " ") return "space";
  if (normalized === "spacebar") return "space";
  if (normalized === "esc") return "escape";
  if (normalized === "return") return "enter";
  if (normalized.startsWith("key") && normalized.length === 4) return normalized.slice(3);
  return normalized;
}

function modifierOptions(modifiers: Set<CanonicalModifier>) {
  if (!modifiers.has("primary")) return [new Set(modifiers)];

  const base = new Set(modifiers);
  base.delete("primary");

  return [
    new Set([...base, "command" as const]),
    new Set([...base, "control" as const])
  ];
}

function sameModifierSet(left: Set<CanonicalModifier>, right: Set<CanonicalModifier>) {
  if (left.size !== right.size) return false;
  return Array.from(left).every((modifier) => right.has(modifier));
}
