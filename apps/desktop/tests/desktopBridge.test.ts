import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLocalSessions,
  deletePrivateFastModel,
  downloadPrivateFastModel,
  getClipboardMarker,
  getPrivateFastStatus,
  getHardwareProfile,
  getPrivateFastModels,
  importPrivateFastModel,
  isTauriRuntime,
  listLocalSessions,
  pasteText,
  requestNativePermissions,
  saveLocalSession,
  selectPrivateFastModel,
  transcribePrivateFast
} from "../src/lib/desktopBridge";
import type { LocalSession } from "@dictivo/shared";

const session: LocalSession = {
  id: "session_1",
  title: "Message 10:30",
  mode: "message",
  language: "en",
  privacyMode: "local-only",
  provider: "local-whisper",
  createdAt: "2026-05-11T12:00:00.000Z",
  durationSeconds: 10,
  wordCount: 2,
  text: "hello world"
};

function createLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => store.clear())
  };
}

describe("desktop bridge browser fallback", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not treat a non-window test runtime as Tauri", () => {
    expect(isTauriRuntime()).toBe(false);
  });

  it("returns explicit preview-only permission states outside the desktop runtime", async () => {
    await expect(requestNativePermissions()).resolves.toEqual({
      microphone: "granted",
      accessibility: "web-preview",
      pasteAutomation: "clipboard-only"
    });
  });

  it("exposes the complete local model catalog in web preview", async () => {
    const models = await getPrivateFastModels();

    expect(models.map((model) => model.id)).toEqual([
      "tiny",
      "base",
      "small",
      "medium-q5_0",
      "large-v3-turbo-q5_0",
      "large-v3-turbo",
      "large-v3"
    ]);
    expect(models.every((model) => !model.installed && !model.selected)).toBe(true);
  });

  it("returns setup-required local engine status outside Tauri", async () => {
    await expect(getPrivateFastStatus()).resolves.toMatchObject({
      ready: false,
      modelId: "small",
      message: "Private Fast requires the desktop app runtime."
    });
  });

  it("estimates hardware without requiring browser-only globals to exist", async () => {
    const profile = await getHardwareProfile();

    expect(profile.platform).toBe("web");
    expect(profile.cpuCores).toBeGreaterThan(0);
    expect(["base", "small", "large-v3-turbo-q5_0"]).toContain(profile.recommendedModelId);
  });

  it("uses navigator hardware hints when available", async () => {
    vi.stubGlobal("navigator", { hardwareConcurrency: 12, deviceMemory: 16 });

    await expect(getHardwareProfile()).resolves.toMatchObject({
      platform: "web",
      cpuCores: 12,
      memoryTotalBytes: 16 * 1024 ** 3,
      performanceClass: "high",
      recommendedModelId: "large-v3-turbo-q5_0",
      recommendedProfile: "quality"
    });
  });

  it("falls back to clipboard copy semantics outside Tauri", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText }, hardwareConcurrency: 8 });

    await expect(pasteText("local transcript")).resolves.toEqual({
      pasted: false,
      copied: true,
      method: "clipboard"
    });
    expect(writeText).toHaveBeenCalledWith("local transcript");
  });

  it("persists, caps, lists, and clears local sessions in browser preview", async () => {
    const manySessions = Array.from({ length: 101 }, (_, index) => ({
      ...session,
      id: `session_${index}`,
      title: `Session ${index}`
    }));

    for (const item of manySessions) {
      await saveLocalSession(item);
    }

    const saved = await listLocalSessions();
    expect(saved).toHaveLength(100);
    expect(saved[0]?.id).toBe("session_100");
    expect(saved[99]?.id).toBe("session_1");

    await clearLocalSessions();
    await expect(listLocalSessions()).resolves.toEqual([]);
  });

  it("returns null clipboard markers outside Tauri", async () => {
    await expect(getClipboardMarker()).resolves.toBeNull();
  });

  it("blocks native model operations outside Tauri", async () => {
    await expect(selectPrivateFastModel("small")).rejects.toThrow("desktop app runtime");
    await expect(downloadPrivateFastModel("small")).rejects.toThrow("desktop app runtime");
    await expect(importPrivateFastModel("small", "/tmp/model.bin")).rejects.toThrow("desktop app runtime");
    await expect(deletePrivateFastModel("small")).rejects.toThrow("desktop app runtime");
  });

  it("blocks native transcription in web preview", async () => {
    await expect(
      transcribePrivateFast(new Blob(["not audio"], { type: "audio/wav" }), {
        language: "en",
        mode: "message",
        source: "microphone",
        profile: "balanced",
        dictionary: [],
        snippets: []
      })
    ).rejects.toThrow("desktop app runtime");
  });
});
