import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock
}));

import {
  benchmarkTier,
  clearLocalSessions,
  copyText,
  deleteLocalSession,
  deletePrivateFastModel,
  detectGpu,
  downloadPrivateFastModel,
  finalizeCalibration,
  getClipboardMarker,
  getPrivateFastStatus,
  getHardwareProfile,
  getPrivateFastModels,
  getRunnableTiers,
  importPrivateFastModel,
  isTauriRuntime,
  listLocalSessions,
  openPermissionSettings,
  pasteText,
  requestNativePermissions,
  rerunBenchmark,
  saveLocalSession,
  selectPrivateFastModel,
  transcribePrivateFast,
  writeRunnableTiers
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
    invokeMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("does not treat a non-window test runtime as Tauri", () => {
    expect(isTauriRuntime()).toBe(false);
  });

  it("returns explicit preview-only permission states outside the desktop runtime", async () => {
    await expect(requestNativePermissions()).resolves.toEqual({
      microphone: "web-preview",
      accessibility: "web-preview",
      pasteAutomation: "clipboard-only"
    });
  });

  it("merges browser microphone permission state inside the desktop runtime", async () => {
    invokeMock.mockResolvedValue({
      microphone: "not-determined",
      accessibility: "granted",
      pasteAutomation: "not-verified"
    });
    const query = vi.fn().mockResolvedValue({ state: "granted" });
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    vi.stubGlobal("navigator", { permissions: { query }, hardwareConcurrency: 8 });

    await expect(requestNativePermissions()).resolves.toEqual({
      microphone: "granted",
      accessibility: "granted",
      pasteAutomation: "not-verified"
    });
    expect(invokeMock).toHaveBeenCalledWith("request_permissions");
    expect(query).toHaveBeenCalledWith({ name: "microphone" });
  });

  it("keeps native permission state when browser microphone permission is unavailable", async () => {
    invokeMock.mockResolvedValue({
      microphone: "not-determined",
      accessibility: "denied",
      pasteAutomation: "not-verified"
    });
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    vi.stubGlobal("navigator", { permissions: { query: vi.fn().mockRejectedValue(new Error("unsupported")) } });

    await expect(requestNativePermissions()).resolves.toEqual({
      microphone: "not-determined",
      accessibility: "denied",
      pasteAutomation: "not-verified"
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
      performanceClass: "gpuHigh",
      recommendedModelId: "large-v3-turbo-q5_0",
      recommendedProfile: "quality"
    });
  });

  it("forwards native hardware, GPU, tier, and benchmark commands inside Tauri", async () => {
    const models = [{ id: "small", label: "Small", installed: true, selected: true }];
    const hardware = {
      platform: "macos",
      arch: "arm64",
      cpuCores: 10,
      memoryTotalBytes: 16 * 1024 ** 3,
      accelerators: ["Metal"],
      performanceClass: "gpuHigh",
      recommendedModelId: "small",
      recommendedProfile: "balanced",
      reason: "Apple Silicon GPU detected."
    };
    const gpus = [{ name: "Apple M-series GPU", vramBytes: null }];
    const runnableTiers = {
      fast: { modelId: "base", realtimeFactor: 0.5, predicted: false, downloaded: true, withinBudget: true },
      medium: { modelId: "small", realtimeFactor: 0.8, predicted: false, downloaded: true, withinBudget: true },
      slow: { modelId: "large-v3", realtimeFactor: 3.2, predicted: true, downloaded: false, withinBudget: false },
      fingerprint: "native-fingerprint",
      benchmarkedAt: "2026-05-13T00:00:00.000Z"
    };
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    invokeMock.mockImplementation((command: string) => {
      if (command === "private_fast_models") return Promise.resolve(models);
      if (command === "hardware_profile") return Promise.resolve(hardware);
      if (command === "detect_gpu") return Promise.resolve(gpus);
      if (command === "runnable_tiers") return Promise.resolve(runnableTiers);
      if (command === "write_runnable_tiers") return Promise.resolve(undefined);
      if (command === "benchmark_tier") return Promise.resolve(0.42);
      if (command === "finalize_calibration") return Promise.resolve(runnableTiers);
      if (command === "rerun_benchmark") return Promise.resolve(undefined);
      return Promise.reject(new Error(`Unexpected command ${command}`));
    });

    await expect(getPrivateFastModels()).resolves.toBe(models);
    await expect(getHardwareProfile()).resolves.toBe(hardware);
    await expect(detectGpu()).resolves.toBe(gpus);
    await expect(getRunnableTiers()).resolves.toBe(runnableTiers);
    await expect(writeRunnableTiers(runnableTiers)).resolves.toBeUndefined();
    await expect(benchmarkTier("small")).resolves.toBe(0.42);
    await expect(finalizeCalibration(0.8, "small")).resolves.toBe(runnableTiers);
    await expect(rerunBenchmark()).resolves.toBeUndefined();

    expect(invokeMock).toHaveBeenNthCalledWith(1, "private_fast_models");
    expect(invokeMock).toHaveBeenNthCalledWith(2, "hardware_profile");
    expect(invokeMock).toHaveBeenNthCalledWith(3, "detect_gpu");
    expect(invokeMock).toHaveBeenNthCalledWith(4, "runnable_tiers");
    expect(invokeMock).toHaveBeenNthCalledWith(5, "write_runnable_tiers", { tiers: runnableTiers });
    expect(invokeMock).toHaveBeenNthCalledWith(6, "benchmark_tier", { modelId: "small" });
    expect(invokeMock).toHaveBeenNthCalledWith(7, "finalize_calibration", {
      measuredMediumRtf: 0.8,
      mediumModelId: "small"
    });
    expect(invokeMock).toHaveBeenNthCalledWith(8, "rerun_benchmark");
  });

  it("builds runnable tier previews when calibration runs outside Tauri", async () => {
    const tiers = await finalizeCalibration(1.2, "small");

    expect(tiers).toMatchObject({
      fast: { modelId: "base", predicted: true, downloaded: false, withinBudget: true },
      medium: { modelId: "small", realtimeFactor: 1.2, predicted: false, downloaded: true, withinBudget: true },
      slow: { modelId: "large-v3", realtimeFactor: 6, predicted: true, downloaded: false, withinBudget: false },
      fingerprint: "web-preview"
    });
    expect(Number.isNaN(Date.parse(tiers.benchmarkedAt))).toBe(false);
  });

  it("falls back to clipboard copy semantics outside Tauri", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText }, hardwareConcurrency: 8 });

    await expect(copyText("copy only")).resolves.toEqual({
      copied: true,
      method: "clipboard"
    });
    await expect(pasteText("local transcript")).resolves.toEqual({
      pasted: false,
      copied: true,
      method: "clipboard"
    });
    expect(writeText).toHaveBeenCalledWith("copy only");
    expect(writeText).toHaveBeenCalledWith("local transcript");
  });

  it("reports unavailable browser clipboard copy explicitly", async () => {
    vi.stubGlobal("navigator", { hardwareConcurrency: 8 });

    await expect(copyText("copy only")).rejects.toThrow("Clipboard copy is not available");
    await expect(pasteText("local transcript")).rejects.toThrow("Clipboard copy is not available");
  });

  it("falls back to selection-based copy when browser clipboard permission is denied", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Write permission denied"));
    const textarea = {
      value: "",
      style: {},
      setAttribute: vi.fn(),
      select: vi.fn(),
      setSelectionRange: vi.fn(),
      remove: vi.fn()
    };
    const execCommand = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { clipboard: { writeText }, hardwareConcurrency: 8 });
    vi.stubGlobal("document", {
      activeElement: null,
      body: { appendChild: vi.fn() },
      createElement: vi.fn(() => textarea),
      execCommand,
      getSelection: vi.fn(() => null)
    });

    await expect(copyText("fallback copy")).resolves.toEqual({
      copied: true,
      method: "clipboard"
    });
    expect(writeText).toHaveBeenCalledWith("fallback copy");
    expect(textarea.value).toBe("fallback copy");
    expect(textarea.select).toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(textarea.remove).toHaveBeenCalled();
  });

  it("persists, caps, lists, deletes one, and clears local sessions in browser preview", async () => {
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

    await deleteLocalSession("session_100");
    const afterSingleDelete = await listLocalSessions();
    expect(afterSingleDelete).toHaveLength(99);
    expect(afterSingleDelete.some((item) => item.id === "session_100")).toBe(false);
    expect(afterSingleDelete[0]?.id).toBe("session_99");

    await clearLocalSessions();
    await expect(listLocalSessions()).resolves.toEqual([]);
  });

  it("upserts local sessions by id in browser preview", async () => {
    await saveLocalSession(session);
    await saveLocalSession({
      ...session,
      title: "Message updated",
      createdAt: "2026-05-11T13:00:00.000Z",
      text: "updated local text"
    });

    const saved = await listLocalSessions();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      id: "session_1",
      title: "Message updated",
      createdAt: "2026-05-11T13:00:00.000Z",
      text: "updated local text"
    });
  });

  it("recovers from corrupted or malformed browser preview history storage", async () => {
    localStorage.setItem("dictivo-local-sessions", "not-json");
    await expect(listLocalSessions()).resolves.toEqual([]);
    expect(localStorage.removeItem).toHaveBeenCalledWith("dictivo-local-sessions");

	    localStorage.setItem(
	      "dictivo-local-sessions",
	      JSON.stringify([
	        session,
	        { ...session, id: "broken_session", text: 42 },
	        { ...session, id: "bad_language", language: "xx" },
	        { ...session, id: "bad_mode", mode: "legacy-email" },
	        { ...session, id: "bad_provider", provider: "openai" },
	        { ...session, id: "bad_privacy", privacyMode: "cloud" },
	        "not a session"
	      ])
	    );
    await expect(listLocalSessions()).resolves.toEqual([session]);
    expect(localStorage.setItem).toHaveBeenLastCalledWith("dictivo-local-sessions", JSON.stringify([session]));

    localStorage.setItem("dictivo-local-sessions", JSON.stringify({ id: "not-array" }));
    await expect(listLocalSessions()).resolves.toEqual([]);
  });

  it("returns null clipboard markers outside Tauri", async () => {
    await expect(getClipboardMarker()).resolves.toBeNull();
  });

  it("forwards clipboard markers and paste/copy requests inside the Tauri runtime", async () => {
    const marker = { kind: "text" as const, signature: "before-transcription" };
    const pasteResult = { pasted: false, copied: true, method: "clipboard-changed-copied" as const };
    const copyResult = { copied: true, method: "native" as const };
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    invokeMock.mockResolvedValueOnce(marker).mockResolvedValueOnce(pasteResult).mockResolvedValueOnce(copyResult);

    await expect(getClipboardMarker()).resolves.toBe(marker);
    await expect(pasteText("protected transcript", marker)).resolves.toBe(pasteResult);
    await expect(copyText("copy only")).resolves.toBe(copyResult);

    expect(invokeMock).toHaveBeenNthCalledWith(1, "clipboard_marker");
    expect(invokeMock).toHaveBeenNthCalledWith(2, "paste_text", {
      text: "protected transcript",
      expectedClipboardMarker: marker
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, "copy_text", { text: "copy only" });
  });

  it("blocks native model operations outside Tauri", async () => {
    await expect(selectPrivateFastModel("small")).rejects.toThrow("desktop app runtime");
    await expect(downloadPrivateFastModel("small")).rejects.toThrow("desktop app runtime");
    await expect(importPrivateFastModel("small", "/tmp/model.bin")).rejects.toThrow("desktop app runtime");
    await expect(deletePrivateFastModel("small")).rejects.toThrow("desktop app runtime");
  });

  it("forwards native model operations inside the Tauri runtime", async () => {
    const nativeStatus = {
      ready: true,
      modelId: "small",
      modelName: "Small",
      message: "Local engine ready.",
      setupHint: ""
    };
    invokeMock.mockResolvedValue(nativeStatus);
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });

    await expect(selectPrivateFastModel("small")).resolves.toBe(nativeStatus);
    await expect(downloadPrivateFastModel("medium")).resolves.toBe(nativeStatus);
    await expect(importPrivateFastModel("large-v3", "/tmp/ggml-large-v3.bin")).resolves.toBe(nativeStatus);
    await expect(deletePrivateFastModel("tiny")).resolves.toBe(nativeStatus);

    expect(invokeMock).toHaveBeenNthCalledWith(1, "select_private_fast_model", { modelId: "small" });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "download_private_fast_model", { modelId: "medium" });
    expect(invokeMock).toHaveBeenNthCalledWith(3, "import_private_fast_model", {
      modelId: "large-v3",
      sourcePath: "/tmp/ggml-large-v3.bin"
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, "delete_private_fast_model", { modelId: "tiny" });
  });

  it("blocks opening system permission settings outside Tauri", async () => {
    await expect(openPermissionSettings("microphone")).rejects.toThrow("desktop app runtime");
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

  it("rejects non-WAV private fast audio before invoking the native command", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });

    await expect(
      transcribePrivateFast(new Blob(["not wav"], { type: "audio/webm" }), {
        language: "en",
        mode: "message",
        source: "microphone",
        profile: "balanced",
        dictionary: [],
        snippets: []
      })
    ).rejects.toThrow("expects a WAV recording");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("encodes WAV audio and only recognition terms for native private fast transcription", async () => {
    invokeMock.mockResolvedValue({ text: "hello from native whisper" });
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });

    await expect(
      transcribePrivateFast(new Blob([Uint8Array.from([0, 1, 2])], { type: "audio/wav" }), {
        language: "de",
        mode: "message",
        source: "microphone",
        profile: "quality",
        dictionary: [" Supabase ", "a", ""],
        snippets: [
          { trigger: " calendar link ", replacement: " https://example.test/calendar " },
          { trigger: "x", replacement: " y " }
        ]
      })
    ).resolves.toBe("hello from native whisper");

    expect(invokeMock).toHaveBeenCalledWith("transcribe_private_fast", {
      audioBase64: "AAEC",
      language: "de",
      mode: "message",
      source: "microphone",
      profile: "quality",
      promptTerms: ["Supabase", "calendar link"]
    });
  });
});
