/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../src/App";
import { DEFAULT_LOCAL_PROCESSING } from "../src/lib/settingsStore";
import type { HardwareProfile, PrivateFastModel, PrivateFastStatus, RunnableTiers } from "../src/lib/desktopBridge";

const bridge = vi.hoisted(() => ({
  benchmarkTier: vi.fn(),
  clearLocalSessions: vi.fn(),
  copyText: vi.fn(),
  deleteLocalSession: vi.fn(),
  deletePrivateFastModel: vi.fn(),
  downloadPrivateFastModel: vi.fn(),
  finalizeCalibration: vi.fn(),
  getClipboardMarker: vi.fn(),
  getHardwareProfile: vi.fn(),
  getPrivateFastModels: vi.fn(),
  getPrivateFastStatus: vi.fn(),
  getRunnableTiers: vi.fn(),
  importPrivateFastModel: vi.fn(),
  isTauriRuntime: vi.fn(),
  listLocalSessions: vi.fn(),
  openPermissionSettings: vi.fn(),
  pasteText: vi.fn(),
  requestNativePermissions: vi.fn(),
  rerunBenchmark: vi.fn(),
  saveLocalSession: vi.fn(),
  selectPrivateFastModel: vi.fn(),
  transcribePrivateFast: vi.fn(),
  writeRunnableTiers: vi.fn()
}));

const shortcut = vi.hoisted(() => ({
  isRegistered: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn()
}));

const media = vi.hoisted(() => ({
  startAudioRecording: vi.fn()
}));

const localDictation = vi.hoisted(() => ({
  runLocalDictation: vi.fn()
}));

const tauriEvents = vi.hoisted(() => ({
  emitTo: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn().mockResolvedValue(() => undefined)
}));

const tauriWindow = vi.hoisted(() => ({
  getByLabel: vi.fn(),
  primaryMonitor: vi.fn(),
  companion: {
    hide: vi.fn().mockResolvedValue(undefined),
    outerSize: vi.fn().mockResolvedValue({ width: 360, height: 100 }),
    setPosition: vi.fn().mockResolvedValue(undefined),
    show: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock("../src/lib/desktopBridge", () => ({
  ...bridge
}));

vi.mock("../src/lib/mediaCapture", () => ({
  startAudioRecording: media.startAudioRecording
}));

vi.mock("../src/lib/localDictationEngine", () => ({
  runLocalDictation: localDictation.runLocalDictation
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn().mockResolvedValue("0.2.0")
}));

vi.mock("@tauri-apps/api/event", () => ({
  emitTo: tauriEvents.emitTo,
  listen: tauriEvents.listen
}));

vi.mock("@tauri-apps/api/window", () => ({
  PhysicalPosition: class PhysicalPosition {
    constructor(public x: number, public y: number) {}
  },
  Window: class MockTauriWindow {
    static getByLabel = tauriWindow.getByLabel;
    constructor(public label: string) {}
    once = vi.fn().mockResolvedValue(undefined);
    show = vi.fn().mockResolvedValue(undefined);
    setFocus = vi.fn().mockResolvedValue(undefined);
    setPosition = vi.fn().mockResolvedValue(undefined);
  },
  primaryMonitor: tauriWindow.primaryMonitor
}));

vi.mock("@tauri-apps/plugin-global-shortcut", () => ({
  isRegistered: shortcut.isRegistered,
  register: shortcut.register,
  unregister: shortcut.unregister
}));

const status: PrivateFastStatus = {
  ready: false,
  modelId: "small",
  modelName: "Small",
  message: "Private Fast requires setup.",
  setupHint: "Download a model."
};

const readyStatus: PrivateFastStatus = {
  ...status,
  ready: true,
  message: "Local engine ready.",
  setupHint: ""
};

const hardware: HardwareProfile = {
  platform: "web",
  arch: "arm64",
  cpuCores: 8,
  memoryTotalBytes: 16 * 1024 ** 3,
  accelerators: [],
  performanceClass: "cpuStrong",
  recommendedModelId: "small",
  recommendedProfile: "balanced",
  reason: "Test hardware."
};

const model: PrivateFastModel = {
  id: "small",
  label: "Small",
  useCase: "Default local dictation",
  speed: "Fast",
  quality: "Good",
  sizeLabel: "469 MB",
  notes: "Good first model.",
  installed: false,
  selected: false
};

const tiers: RunnableTiers = {
  fast: { modelId: "small", realtimeFactor: 0.5, predicted: true, downloaded: false, withinBudget: true },
  medium: { modelId: "small", realtimeFactor: 1, predicted: true, downloaded: false, withinBudget: true },
  slow: { modelId: "large-v3", realtimeFactor: 3, predicted: true, downloaded: false, withinBudget: false },
  fingerprint: "test",
  benchmarkedAt: "2026-05-13T00:00:00.000Z"
};

const session = {
  id: "session_1",
  title: "Message 10:30",
  mode: "message" as const,
  language: "en" as const,
  privacyMode: "local-only" as const,
  provider: "local-whisper" as const,
  createdAt: "2026-05-13T00:00:00.000Z",
  durationSeconds: 3,
  wordCount: 2,
  text: "last transcript"
};

const secondSession = {
  ...session,
  id: "session_2",
  title: "Message 10:31",
  createdAt: "2026-05-13T00:01:00.000Z",
  text: "remaining transcript"
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
    })
  };
}

function seedCompletedSettings(overrides: Record<string, unknown> = {}) {
  localStorage.setItem(
    "dictivo-settings-v4",
    JSON.stringify({
      language: "en",
      selectedTier: "medium",
      onboardingCompleted: true,
      companionEnabled: false,
      companionAvatar: "dog",
      hotkeys: {
        dictation: "CommandOrControl+Shift+Space",
        pasteLast: "CommandOrControl+Shift+V",
        activationMode: "toggle"
      },
      localProcessing: DEFAULT_LOCAL_PROCESSING,
      dictionary: [],
      snippets: [],
      ...overrides
    })
  );
}

describe("App startup recovery", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorage());
    seedCompletedSettings();
    bridge.isTauriRuntime.mockReturnValue(false);
    bridge.listLocalSessions.mockResolvedValue([]);
    bridge.getPrivateFastStatus.mockResolvedValue(status);
    bridge.getPrivateFastModels.mockResolvedValue([model]);
    bridge.getHardwareProfile.mockResolvedValue(hardware);
    bridge.requestNativePermissions.mockResolvedValue({
      microphone: "web-preview",
      accessibility: "web-preview",
      pasteAutomation: "clipboard-only"
    });
    bridge.getRunnableTiers.mockResolvedValue(tiers);
    bridge.getClipboardMarker.mockResolvedValue(null);
    bridge.pasteText.mockResolvedValue({ pasted: false, copied: true, method: "clipboard" });
    bridge.saveLocalSession.mockResolvedValue(undefined);
    bridge.writeRunnableTiers.mockResolvedValue(undefined);
    tauriWindow.getByLabel.mockResolvedValue(null);
    tauriWindow.primaryMonitor.mockResolvedValue(null);
    tauriWindow.companion.hide.mockResolvedValue(undefined);
    tauriWindow.companion.outerSize.mockResolvedValue({ width: 360, height: 100 });
    tauriWindow.companion.setPosition.mockResolvedValue(undefined);
    tauriWindow.companion.show.mockResolvedValue(undefined);
    tauriEvents.emitTo.mockResolvedValue(undefined);
    tauriEvents.listen.mockResolvedValue(() => undefined);
    media.startAudioRecording.mockResolvedValue({
      startedAt: Date.now() - 1500,
      format: "wav",
      source: "microphone",
      stop: vi.fn().mockResolvedValue(new Blob(["wav"], { type: "audio/wav" }))
    });
    localDictation.runLocalDictation.mockResolvedValue({
      rawText: "Recovered transcript",
      finalizedText: "Recovered transcript.",
      profileUsed: "balanced",
      fallbackUsed: false
    });
    shortcut.isRegistered.mockResolvedValue(false);
    shortcut.register.mockResolvedValue(undefined);
    shortcut.unregister.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows a readable status when local history fails to load", async () => {
    bridge.listLocalSessions.mockRejectedValueOnce(new Error("History database unreadable"));

    render(<App />);

    await waitFor(() => expect(screen.getByText("History database unreadable")).toBeTruthy());
  });

  it("shows a readable status when startup native refresh fails", async () => {
    bridge.getPrivateFastStatus.mockRejectedValueOnce(new Error("Native status unavailable"));

    render(<App />);

    await waitFor(() => expect(screen.getByText("Native status unavailable")).toBeTruthy());
  });

  it("keeps startup native refresh active under React StrictMode remount checks", async () => {
    render(
      <StrictMode>
        <App />
      </StrictMode>
    );

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));

    await waitFor(() => expect(screen.getByText("Private Fast requires setup.")).toBeTruthy());
  });

  it("shows a readable status when runnable tier cache fails to load", async () => {
    bridge.getRunnableTiers.mockRejectedValueOnce(new Error("Tier cache unreadable"));

    render(<App />);

    await waitFor(() => expect(screen.getByText("Tier cache unreadable")).toBeTruthy());
  });

  it("continues startup if legacy settings cleanup is blocked", async () => {
    const originalRemoveItem = localStorage.removeItem;
    localStorage.removeItem = vi.fn((key: string) => {
      if (key === "dictivo-settings-v2") throw new Error("Storage cleanup blocked");
      originalRemoveItem.call(localStorage, key);
    });

    render(<App />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Private Dictation." })).toBeTruthy());
    expect(screen.getByLabelText("Dictation language")).toBeTruthy();
  });

  it("updates main workbench hotkey chips after changing shortcuts in Settings", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Private Dictation." })).toBeTruthy());
    expect(screen.getAllByText("⌘⇧Space").length).toBeGreaterThan(0);
    expect(screen.getByText("Start / stop dictation")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("button", { name: /Hotkeys/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "Change" })[0]!);
    fireEvent.keyDown(window, { key: "K", ctrlKey: true, altKey: true });
    fireEvent.change(screen.getByDisplayValue("Toggle"), { target: { value: "hold" } });

    fireEvent.click(screen.getByRole("button", { name: "Dictation" }));

    await waitFor(() => expect(screen.getAllByText("⌘⌥K").length).toBeGreaterThan(0));
    expect(screen.getAllByTitle("CommandOrControl+Alt+K")).toHaveLength(2);
    expect(screen.getByText("Hold and speak")).toBeTruthy();
    expect(screen.queryByText("Start / stop dictation")).toBeNull();
  });

  it("keeps dictation workbench navigation and companion controls wired through app state", async () => {
    const workbenchTiers: RunnableTiers = {
      ...tiers,
      fast: { modelId: "base", realtimeFactor: 0.4, predicted: false, downloaded: true, withinBudget: true },
      medium: { modelId: "small", realtimeFactor: 0.9, predicted: false, downloaded: true, withinBudget: true }
    };
    seedCompletedSettings({ companionEnabled: true });
    bridge.getPrivateFastStatus.mockResolvedValue(readyStatus);
    bridge.getRunnableTiers.mockResolvedValue(workbenchTiers);
    bridge.listLocalSessions.mockResolvedValue([session]);

    render(<App />);

    expect(await screen.findByLabelText("Floating companion preview")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Medium" }).getAttribute("aria-checked")).toBe("true");

    fireEvent.click(screen.getByRole("radio", { name: "Fast" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Fast" }).getAttribute("aria-checked")).toBe("true"));

    fireEvent.click(screen.getByRole("button", { name: "Hide preview" }));
    expect(screen.queryByLabelText("Floating companion preview")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Resume from history" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Local History" })).toBeTruthy());
    expect(screen.getByText("last transcript")).toBeTruthy();
  });

  it("uses CJK character counts and persists the selected dictation language", async () => {
    bridge.getPrivateFastStatus.mockResolvedValue(readyStatus);
    localDictation.runLocalDictation.mockResolvedValueOnce({
      rawText: "你好世界",
      finalizedText: "你好世界",
      profileUsed: "balanced",
      fallbackUsed: false
    });

    render(<App />);

    await waitFor(() => expect(screen.getByText("Engine ready")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Dictation language"), { target: { value: "zh" } });
    fireEvent.change(screen.getByLabelText("Live dictation text"), { target: { value: "你好世界" } });

    expect(screen.getByText(/4 characters/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Start dictation" }));
    await waitFor(() => expect(media.startAudioRecording).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Stop dictation" }));

    await waitFor(() => expect(localDictation.runLocalDictation).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ language: "zh" })));
    await waitFor(() =>
      expect(bridge.saveLocalSession).toHaveBeenCalledWith(
        expect.objectContaining({
          language: "zh",
          text: "你好世界",
          wordCount: 4
        })
      )
    );
  });

  it("passes Processing toggle changes from Settings into local dictation", async () => {
    bridge.getPrivateFastStatus.mockResolvedValue(readyStatus);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByText("Processing toggles"));
    fireEvent.click(screen.getByLabelText("Auto polish"));
    fireEvent.click(screen.getByRole("button", { name: "Dictation" }));

    await waitFor(() => expect(screen.getByText("Engine ready")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Start dictation" }));
    await waitFor(() => expect(media.startAudioRecording).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Stop dictation" }));

    await waitFor(() =>
      expect(localDictation.runLocalDictation).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.objectContaining({
          localProcessing: expect.objectContaining({ autoPolish: false })
        })
      )
    );
  });

  it("shows microphone denial without saving an empty history item", async () => {
    bridge.getPrivateFastStatus.mockResolvedValue(readyStatus);
    media.startAudioRecording.mockRejectedValueOnce(new Error("Microphone permission denied"));

    render(<App />);

    await waitFor(() => expect(screen.getByText("Engine ready")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Start dictation" }));

    await waitFor(() => expect(screen.getByText("Microphone permission denied")).toBeTruthy());
    expect(screen.getByLabelText("Live dictation text")).toHaveProperty("value", "");
    expect(localDictation.runLocalDictation).not.toHaveBeenCalled();
    expect(bridge.saveLocalSession).not.toHaveBeenCalled();
  });

  it("queues stop when microphone setup finishes after the user stops dictation", async () => {
    bridge.getPrivateFastStatus.mockResolvedValue(readyStatus);
    const stopRecording = vi.fn().mockResolvedValue(new Blob(["wav"], { type: "audio/wav" }));
    let resolveRecording: ((controller: { startedAt: number; format: "wav"; source: "microphone"; stop: () => Promise<Blob> }) => void) | undefined;
    media.startAudioRecording.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRecording = resolve;
      })
    );

    render(<App />);

    await waitFor(() => expect(screen.getByText("Engine ready")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Start dictation" }));
    await waitFor(() => expect(media.startAudioRecording).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Stop dictation" }));

    expect(screen.getByText("Stopping recording as soon as the microphone is ready...")).toBeTruthy();

    await act(async () => {
      resolveRecording?.({
        startedAt: Date.now() - 1500,
        format: "wav",
        source: "microphone",
        stop: stopRecording
      });
    });

    await waitFor(() => expect(stopRecording).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(localDictation.runLocalDictation).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("No active recording was found.")).toBeNull();
  });

  it("keeps transcript and history when clipboard changes before auto paste", async () => {
    bridge.getPrivateFastStatus.mockResolvedValue(readyStatus);
    bridge.getClipboardMarker.mockResolvedValueOnce({ kind: "text", signature: "before" });
    bridge.pasteText.mockResolvedValueOnce({ pasted: false, copied: true, method: "clipboard-changed-copied" });

    render(<App />);

    await waitFor(() => expect(screen.getByText("Engine ready")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Start dictation" }));
    await waitFor(() => expect(media.startAudioRecording).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Stop dictation" }));

    await waitFor(() =>
      expect(bridge.pasteText).toHaveBeenCalledWith("Recovered transcript.", { kind: "text", signature: "before" })
    );
    await waitFor(() => expect(screen.getByLabelText("Live dictation text")).toHaveProperty("value", "Recovered transcript."));
    await waitFor(() => expect(bridge.saveLocalSession).toHaveBeenCalledWith(expect.objectContaining({ text: "Recovered transcript." })));
    expect(screen.getByText(/clipboard changed during transcription/i)).toBeTruthy();
    expect(screen.getByText(/Copied; auto paste skipped/i)).toBeTruthy();
  });

  it("deletes a single history message through the app bridge and refreshes the list", async () => {
    bridge.listLocalSessions
      .mockResolvedValueOnce([session, secondSession])
      .mockResolvedValueOnce([secondSession]);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "History" }));
    expect(await screen.findByText("last transcript")).toBeTruthy();
    expect(screen.getByText("remaining transcript")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Delete message" })[0]!);

    await waitFor(() => expect(bridge.deleteLocalSession).toHaveBeenCalledWith("session_1"));
    await waitFor(() => expect(screen.getByText("Message deleted.")).toBeTruthy());
    expect(screen.queryByText("last transcript")).toBeNull();
    expect(screen.getByText("remaining transcript")).toBeTruthy();
  });

  it("clears all history through the app bridge after confirmation", async () => {
    bridge.listLocalSessions
      .mockResolvedValueOnce([session])
      .mockResolvedValueOnce([]);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "History" }));
    expect(await screen.findByText("last transcript")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear local history" }));
    expect(screen.getByRole("group", { name: "Confirm clear local history" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete all" }));

	    await waitFor(() => expect(bridge.clearLocalSessions).toHaveBeenCalledTimes(1));
	    await waitFor(() => expect(screen.getByText("Local history cleared.")).toBeTruthy());
	    expect(screen.queryByText("last transcript")).toBeNull();
	    expect(screen.getByText("No local dictations yet.")).toBeTruthy();
	  });

  it("copies and pastes history messages through the app bridge", async () => {
    const sessionWithRaw = {
      ...session,
      rawText: "raw history transcript",
      text: "final history transcript"
    };
    bridge.listLocalSessions.mockResolvedValue([sessionWithRaw]);
    bridge.copyText.mockResolvedValue({ copied: true, method: "clipboard" });
    bridge.pasteText.mockResolvedValueOnce({ pasted: true, copied: true, method: "clipboard" });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "History" }));
    expect(await screen.findByText("final history transcript")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Copy raw transcript" }));
    await waitFor(() => expect(bridge.copyText).toHaveBeenCalledWith("raw history transcript"));
    expect(screen.getByText("Raw transcript copied to clipboard.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Copy final text" }));
    await waitFor(() => expect(bridge.copyText).toHaveBeenCalledWith("final history transcript"));
    expect(screen.getByText("Final text copied to clipboard.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Paste final text" }));
    await waitFor(() => expect(bridge.pasteText).toHaveBeenCalledWith("final history transcript"));
    expect(screen.getByText("History message pasted.")).toBeTruthy();
  });

  it("adds and removes dictionary terms and snippets through app state", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Dictionary" }));

    fireEvent.change(screen.getByLabelText("Dictionary term"), { target: { value: " Supabase " } });
    fireEvent.click(screen.getByRole("button", { name: "Add term" }));
    expect(screen.getByRole("button", { name: "Remove dictionary term Supabase" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove dictionary term Supabase" }));
    expect(screen.queryByRole("button", { name: "Remove dictionary term Supabase" })).toBeNull();
    expect(screen.getByText("No local dictionary terms yet.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Snippet trigger"), { target: { value: "calendar link" } });
    fireEvent.change(screen.getByLabelText("Snippet replacement"), { target: { value: "https://example.test/calendar" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText("calendar link")).toBeTruthy();
    expect(screen.getByText("https://example.test/calendar")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove snippet calendar link" }));
    expect(screen.queryByText("https://example.test/calendar")).toBeNull();
    expect(screen.getByText("No local snippets yet.")).toBeTruthy();
  });

  it("filters dictionary and snippets by the selected language before dictation", async () => {
    seedCompletedSettings({
      language: "en",
      dictionary: [
        { id: "term_en", value: "Dictivo", language: "en", createdAt: "2026-05-13T00:00:00.000Z" },
        { id: "term_de", value: "Worterbuch", language: "de", createdAt: "2026-05-13T00:00:00.000Z" }
      ],
      snippets: [
        { id: "snippet_en", trigger: "calendar", replacement: "https://en.example/calendar", language: "en", createdAt: "2026-05-13T00:00:00.000Z" },
        { id: "snippet_de", trigger: "kalender", replacement: "https://de.example/kalender", language: "de", createdAt: "2026-05-13T00:00:00.000Z" }
      ]
    });
    bridge.getPrivateFastStatus.mockResolvedValue(readyStatus);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Dictionary" }));
    expect(screen.getByRole("button", { name: "Remove dictionary term Dictivo" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove dictionary term Worterbuch" })).toBeNull();
    expect(screen.getByText("https://en.example/calendar")).toBeTruthy();
    expect(screen.queryByText("https://de.example/kalender")).toBeNull();

    fireEvent.change(screen.getByLabelText("Dictation language"), { target: { value: "de" } });
    expect(screen.getByRole("button", { name: "Remove dictionary term Worterbuch" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove dictionary term Dictivo" })).toBeNull();
    expect(screen.getByText("https://de.example/kalender")).toBeTruthy();
    expect(screen.queryByText("https://en.example/calendar")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Dictation" }));
    await waitFor(() => expect(screen.getByText("Engine ready")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Start dictation" }));
    await waitFor(() => expect(media.startAudioRecording).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Stop dictation" }));

    await waitFor(() =>
      expect(localDictation.runLocalDictation).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.objectContaining({
          language: "de",
          dictionary: ["Worterbuch"],
          snippets: [{ trigger: "kalender", replacement: "https://de.example/kalender" }]
        })
      )
    );
  });

  it("opens system permission settings and refreshes privacy state through the app bridge", async () => {
    bridge.requestNativePermissions
      .mockResolvedValueOnce({
        microphone: "granted",
        accessibility: "denied",
        pasteAutomation: "not-required"
      })
      .mockResolvedValueOnce({
        microphone: "granted",
        accessibility: "granted",
        pasteAutomation: "not-required"
      });
    bridge.openPermissionSettings.mockResolvedValue(undefined);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Privacy" }));
    await waitFor(() => expect(screen.getByText("Enable this permission in system settings before using the related workflow.")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    await waitFor(() => expect(bridge.openPermissionSettings).toHaveBeenCalledWith("accessibility"));
    expect(screen.getByText("Opened system settings. Refresh local status after granting the permission.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Refresh local status" }));
    await waitFor(() => expect(bridge.requestNativePermissions).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryAllByRole("button", { name: "Open settings" })).toHaveLength(0));
  });

  it("shows a readable status when system permission settings cannot open", async () => {
    bridge.requestNativePermissions.mockResolvedValue({
      microphone: "granted",
      accessibility: "denied",
      pasteAutomation: "not-required"
    });
    bridge.openPermissionSettings.mockRejectedValueOnce(new Error("System settings unavailable"));

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Privacy" }));
    await waitFor(() => expect(screen.getByText("Enable this permission in system settings before using the related workflow.")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));

    await waitFor(() => expect(bridge.openPermissionSettings).toHaveBeenCalledWith("accessibility"));
    await waitFor(() => expect(screen.getByText("System settings unavailable")).toBeTruthy());
  });

  it("rolls back the selected tier when model activation fails", async () => {
    const switchTiers: RunnableTiers = {
      ...tiers,
      fast: { modelId: "base", realtimeFactor: 0.4, predicted: false, downloaded: true, withinBudget: true },
      medium: { modelId: "small", realtimeFactor: 0.9, predicted: false, downloaded: true, withinBudget: true }
    };
    bridge.isTauriRuntime.mockReturnValue(true);
    bridge.getRunnableTiers.mockResolvedValue(switchTiers);
    bridge.selectPrivateFastModel.mockRejectedValueOnce(new Error("Unable to activate base model"));

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Medium tier/i }).getAttribute("aria-pressed")).toBe("true"));

    fireEvent.click(screen.getByRole("button", { name: /Fast tier/i }));

    await waitFor(() => expect(screen.getByText("Unable to activate base model")).toBeTruthy());
    expect(screen.getByRole("button", { name: /Medium tier/i }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Fast tier/i }).getAttribute("aria-pressed")).toBe("false");
  });

  it("benchmarks a downloaded non-medium tier without corrupting medium calibration", async () => {
    const switchTiers: RunnableTiers = {
      ...tiers,
      fast: { modelId: "base", realtimeFactor: 0.4, predicted: true, downloaded: false, withinBudget: true },
      medium: { modelId: "small", realtimeFactor: 0.9, predicted: false, downloaded: true, withinBudget: true }
    };
    bridge.isTauriRuntime.mockReturnValue(true);
    bridge.getPrivateFastStatus.mockResolvedValue(readyStatus);
    bridge.getRunnableTiers.mockResolvedValue(switchTiers);
    bridge.downloadPrivateFastModel.mockResolvedValue(readyStatus);
    bridge.benchmarkTier.mockResolvedValue(0.42);
    bridge.selectPrivateFastModel.mockResolvedValue({ ...readyStatus, modelId: "base", modelName: "Base" });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Medium tier/i }).getAttribute("aria-pressed")).toBe("true"));

    fireEvent.click(screen.getByRole("button", { name: /Fast tier/i }));
    const dialog = await screen.findByRole("dialog", { name: "Download Fast?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Download" }));

    await waitFor(() => expect(bridge.selectPrivateFastModel).toHaveBeenCalledWith("base"));
    expect(bridge.finalizeCalibration).not.toHaveBeenCalled();
    expect(bridge.writeRunnableTiers).toHaveBeenCalledWith(
      expect.objectContaining({
        fast: expect.objectContaining({
          modelId: "base",
          realtimeFactor: 0.42,
          predicted: false,
          downloaded: true,
          withinBudget: true
        }),
        medium: expect.objectContaining({
          modelId: "small",
          realtimeFactor: 0.9,
          predicted: false,
          downloaded: true
        })
      })
    );
  });

  it("downloads and benchmarks an out-of-budget Quality tier after the user confirms the warning", async () => {
    const switchTiers: RunnableTiers = {
      ...tiers,
      medium: { modelId: "small", realtimeFactor: 0.9, predicted: false, downloaded: true, withinBudget: true },
      slow: { modelId: "large-v3", realtimeFactor: 4.5, predicted: true, downloaded: false, withinBudget: false }
    };
    bridge.isTauriRuntime.mockReturnValue(true);
    bridge.getPrivateFastStatus.mockResolvedValue(readyStatus);
    bridge.getRunnableTiers.mockResolvedValue(switchTiers);
    bridge.downloadPrivateFastModel.mockResolvedValue(readyStatus);
    bridge.benchmarkTier.mockResolvedValue(4.5);
    bridge.selectPrivateFastModel.mockResolvedValue({ ...readyStatus, modelId: "large-v3", modelName: "Large v3" });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: /Quality tier/i }));
    const dialog = await screen.findByRole("dialog", { name: "Quality may run slowly" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(bridge.downloadPrivateFastModel).toHaveBeenCalledWith("large-v3"));
    expect(bridge.benchmarkTier).toHaveBeenCalledWith("large-v3");
    await waitFor(() => expect(bridge.selectPrivateFastModel).toHaveBeenCalledWith("large-v3"));
    expect(bridge.finalizeCalibration).not.toHaveBeenCalled();
    expect(bridge.writeRunnableTiers).toHaveBeenCalledWith(
      expect.objectContaining({
        slow: expect.objectContaining({
          modelId: "large-v3",
          realtimeFactor: 4.5,
          predicted: false,
          downloaded: true,
          withinBudget: false
        }),
        medium: expect.objectContaining({
          modelId: "small",
          realtimeFactor: 0.9,
          predicted: false,
          downloaded: true
        })
      })
    );
  });

  it("refreshes local engine status and model state through the app bridge", async () => {
    const installedModel = { ...model, installed: true, selected: true };
    bridge.getPrivateFastStatus
      .mockResolvedValueOnce(status)
      .mockResolvedValueOnce(readyStatus);
    bridge.getPrivateFastModels
      .mockResolvedValueOnce([model])
      .mockResolvedValueOnce([installedModel]);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    await waitFor(() => expect(screen.getByText("Private Fast requires setup.")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));

    await waitFor(() => expect(bridge.getPrivateFastStatus).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText("Local engine ready.")).toBeTruthy());
    fireEvent.click(screen.getByText("Advanced — full model catalog"));
    expect(screen.getByText("Installed · Selected")).toBeTruthy();
  });

  it("re-runs the Medium calibration through the app bridge", async () => {
    const calibratedTiers: RunnableTiers = {
      ...tiers,
      medium: { modelId: "small", realtimeFactor: 0.9, predicted: false, downloaded: true, withinBudget: true }
    };
    const freshTiers: RunnableTiers = {
      ...calibratedTiers,
      medium: { modelId: "small", realtimeFactor: 0.72, predicted: false, downloaded: true, withinBudget: true },
      benchmarkedAt: "2026-05-13T01:00:00.000Z"
    };
    bridge.isTauriRuntime.mockReturnValue(true);
    bridge.getPrivateFastStatus.mockResolvedValue(readyStatus);
    bridge.getRunnableTiers.mockResolvedValue(calibratedTiers);
    bridge.rerunBenchmark.mockResolvedValue(undefined);
    bridge.benchmarkTier.mockResolvedValue(0.72);
    bridge.finalizeCalibration.mockResolvedValue(freshTiers);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Medium tier/i }).textContent).toContain("Active"));

    fireEvent.click(screen.getByRole("button", { name: "Re-run setup" }));

    await waitFor(() => expect(bridge.rerunBenchmark).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(bridge.benchmarkTier).toHaveBeenCalledWith("small"));
    expect(bridge.finalizeCalibration).toHaveBeenCalledWith(0.72, "small");
  });

  it("opens the setup wizard from Local Engine settings and returns to dictation after skipping", async () => {
    bridge.getPrivateFastStatus.mockResolvedValue(readyStatus);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: /Run setup wizard/ }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Looking at your computer" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Skip setup" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Private Dictation." })).toBeTruthy());
  });

  it("deletes a local engine model through the app bridge", async () => {
    const installedModel = { ...model, installed: true, selected: false };
    bridge.isTauriRuntime.mockReturnValue(true);
    bridge.getPrivateFastStatus.mockResolvedValue(readyStatus);
    bridge.getPrivateFastModels.mockResolvedValue([installedModel]);
    bridge.deletePrivateFastModel.mockResolvedValue(readyStatus);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByText("Advanced — full model catalog"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Delete Small?" })).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(bridge.deletePrivateFastModel).toHaveBeenCalledWith("small"));
    await waitFor(() => expect(screen.getByText("Local model deleted.")).toBeTruthy());
  });

  it("imports a local engine model through the app bridge with a trimmed path", async () => {
    bridge.isTauriRuntime.mockReturnValue(true);
    bridge.getPrivateFastStatus.mockResolvedValue(readyStatus);
    bridge.importPrivateFastModel.mockResolvedValue(readyStatus);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByText("Advanced — full model catalog"));
    fireEvent.change(screen.getByLabelText("Model file path"), { target: { value: " /tmp/ggml-small.bin " } });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(bridge.importPrivateFastModel).toHaveBeenCalledWith("small", "/tmp/ggml-small.bin"));
    await waitFor(() => expect(screen.getByText("Local model imported and selected.")).toBeTruthy());
  });

  it("shows import errors and releases the local engine operation lock", async () => {
    bridge.isTauriRuntime.mockReturnValue(true);
    bridge.getPrivateFastStatus.mockResolvedValue(readyStatus);
    bridge.importPrivateFastModel.mockRejectedValueOnce(new Error("Imported file is not a supported model"));

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByText("Advanced — full model catalog"));
    fireEvent.change(screen.getByLabelText("Model file path"), { target: { value: " /tmp/not-a-model.txt " } });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(bridge.importPrivateFastModel).toHaveBeenCalledWith("small", "/tmp/not-a-model.txt"));
    await waitFor(() => expect(screen.getByText("Imported file is not a supported model")).toBeTruthy());
    expect((screen.getByRole("button", { name: "Import" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("opens and syncs the native companion window when the sidebar mascot is clicked", async () => {
    bridge.isTauriRuntime.mockReturnValue(true);
    bridge.getPrivateFastStatus.mockResolvedValue(readyStatus);
    tauriWindow.getByLabel.mockResolvedValue(tauriWindow.companion);
    tauriWindow.primaryMonitor.mockResolvedValue({
      workArea: {
        position: { x: 0, y: 0 },
        size: { width: 1440, height: 900 }
      }
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Show floating companion" }));

    await waitFor(() => expect(tauriWindow.companion.show).toHaveBeenCalled());
    expect(tauriWindow.getByLabel).toHaveBeenCalledWith("companion");
    expect(tauriWindow.companion.outerSize).toHaveBeenCalled();
    expect(tauriWindow.companion.setPosition).toHaveBeenCalledWith(expect.objectContaining({ x: 1056, y: 24 }));
    expect(tauriEvents.emitTo).toHaveBeenCalledWith(
      "companion",
      "companion-state",
      expect.objectContaining({
        enabled: true,
        avatar: "dog",
        phase: "idle",
        title: "Standing by"
      })
    );
  });

  it("shows a readable status when the native companion window is unavailable", async () => {
    bridge.isTauriRuntime.mockReturnValue(true);
    bridge.getPrivateFastStatus.mockResolvedValue(readyStatus);
    tauriWindow.getByLabel.mockResolvedValue(null);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Show floating companion" }));

    await waitFor(() => expect(screen.getByText("Floating companion window is unavailable.")).toBeTruthy());
    expect(tauriWindow.companion.show).not.toHaveBeenCalled();
    expect(tauriEvents.emitTo).not.toHaveBeenCalledWith("companion", "companion-state", expect.anything());
  });

  it("honors native companion hide requests in the main window state", async () => {
    let hideHandler: (() => void) | undefined;
    bridge.isTauriRuntime.mockReturnValue(true);
    bridge.getPrivateFastStatus.mockResolvedValue(readyStatus);
    tauriWindow.getByLabel.mockResolvedValue(tauriWindow.companion);
    tauriEvents.listen.mockImplementation((eventName: string, handler: () => void) => {
      if (eventName === "companion-hide-requested") hideHandler = handler;
      return Promise.resolve(() => undefined);
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Show floating companion" }));
    await waitFor(() => expect(hideHandler).toBeTruthy());

    hideHandler?.();

    await waitFor(() => expect(screen.getByText("Floating companion hidden. Re-enable it in Settings -> Companion.")).toBeTruthy());
    await waitFor(() => expect(tauriWindow.companion.hide).toHaveBeenCalled());
  });

  it("unsubscribes companion hide requests if the app unmounts before the native listener resolves", async () => {
    let resolveListen: ((cleanup: () => void) => void) | undefined;
    const cleanupListener = vi.fn();
    bridge.isTauriRuntime.mockReturnValue(true);
    bridge.getPrivateFastStatus.mockResolvedValue(readyStatus);
    tauriEvents.listen.mockImplementationOnce(() => {
      return new Promise((resolve) => {
        resolveListen = resolve;
      });
    });

    const { unmount } = render(<App />);

    await waitFor(() => expect(resolveListen).toBeTruthy());
    unmount();

    await act(async () => {
      resolveListen?.(cleanupListener);
    });

    expect(cleanupListener).toHaveBeenCalledTimes(1);
  });

  it("unregisters hotkeys again if native registration resolves after cleanup", async () => {
    let resolveRegister: (() => void) | undefined;
    bridge.isTauriRuntime.mockReturnValue(true);
    bridge.getPrivateFastStatus.mockResolvedValue(readyStatus);
    shortcut.isRegistered.mockResolvedValue(true);
    shortcut.register.mockImplementationOnce(() => {
      return new Promise<void>((resolve) => {
        resolveRegister = resolve;
      });
    });

    const { unmount } = render(<App />);

    await waitFor(() => expect(resolveRegister).toBeTruthy());
    unmount();
    expect(shortcut.unregister).toHaveBeenCalledWith(["CommandOrControl+Shift+Space", "CommandOrControl+Shift+V"]);

    await act(async () => {
      resolveRegister?.();
    });

    await waitFor(() => expect(shortcut.unregister).toHaveBeenCalledTimes(2));
  });

  it("does not start duplicate recordings when hold hotkey repeats before release", async () => {
    let hotkeyHandler: ((event: { shortcut: string; state: "Pressed" | "Released" }) => void) | undefined;
    const stopRecording = vi.fn().mockResolvedValue(new Blob(["wav"], { type: "audio/wav" }));
    seedCompletedSettings({
      hotkeys: {
        dictation: "CommandOrControl+Shift+Space",
        pasteLast: "CommandOrControl+Shift+V",
        activationMode: "hold"
      }
    });
    bridge.isTauriRuntime.mockReturnValue(true);
    bridge.getPrivateFastStatus.mockResolvedValue(readyStatus);
    media.startAudioRecording.mockResolvedValue({
      startedAt: Date.now() - 1500,
      format: "wav",
      source: "microphone",
      stop: stopRecording
    });
    shortcut.isRegistered.mockResolvedValue(true);
    shortcut.register.mockImplementation((_shortcuts, handler) => {
      hotkeyHandler = handler;
      return Promise.resolve();
    });

    render(<App />);

    await waitFor(() => expect(screen.getByText("Engine ready")).toBeTruthy());
    await waitFor(() => expect(hotkeyHandler).toBeTruthy());
    hotkeyHandler?.({ shortcut: "Command+Shift+Space", state: "Pressed" });
    hotkeyHandler?.({ shortcut: "Command+Shift+Space", state: "Pressed" });

    await waitFor(() => expect(media.startAudioRecording).toHaveBeenCalledTimes(1));

    hotkeyHandler?.({ shortcut: "Command+Shift+Space", state: "Released" });

    await waitFor(() => expect(stopRecording).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(localDictation.runLocalDictation).toHaveBeenCalledTimes(1));
  });

  it("pastes the latest history message when paste-last hotkey succeeds", async () => {
    let hotkeyHandler: ((event: { shortcut: string; state: "Pressed" | "Released" }) => void) | undefined;
    bridge.isTauriRuntime.mockReturnValue(true);
    bridge.listLocalSessions.mockResolvedValue([session]);
    bridge.pasteText.mockResolvedValueOnce({ pasted: true, copied: true, method: "macos-apple-events" });
    shortcut.isRegistered.mockResolvedValue(true);
    shortcut.register.mockImplementation((_shortcuts, handler) => {
      hotkeyHandler = handler;
      return Promise.resolve();
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "History" }));
    expect(await screen.findByText("last transcript")).toBeTruthy();
    await waitFor(() => expect(hotkeyHandler).toBeTruthy());

    hotkeyHandler?.({ shortcut: "Command+Shift+V", state: "Pressed" });

    await waitFor(() => expect(bridge.pasteText).toHaveBeenCalledWith("last transcript"));
    await waitFor(() => expect(screen.getByText("Last local transcript is ready in the target app or clipboard.")).toBeTruthy());
  });

  it("shows a readable status when paste-last hotkey fails", async () => {
    let hotkeyHandler: ((event: { shortcut: string; state: "Pressed" | "Released" }) => void) | undefined;
    bridge.isTauriRuntime.mockReturnValue(true);
    bridge.listLocalSessions.mockResolvedValue([session]);
    bridge.pasteText.mockRejectedValueOnce(new Error("Clipboard paste blocked"));
    shortcut.isRegistered.mockResolvedValue(true);
    shortcut.register.mockImplementation((_shortcuts, handler) => {
      hotkeyHandler = handler;
      return Promise.resolve();
    });

    render(<App />);

    await waitFor(() => expect(hotkeyHandler).toBeTruthy());
    hotkeyHandler?.({ shortcut: "Command+Shift+V", state: "Pressed" });

    await waitFor(() => expect(screen.getByText("Clipboard paste blocked")).toBeTruthy());
  });

  it("keeps the transcript visible when history save fails after transcription", async () => {
    bridge.getPrivateFastStatus.mockResolvedValue(readyStatus);
    bridge.saveLocalSession.mockRejectedValueOnce(new Error("History database locked"));

    render(<App />);

    await waitFor(() => expect(screen.getByText("Engine ready")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Start dictation" }));
    await waitFor(() => expect(media.startAudioRecording).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Stop dictation" }));

    await waitFor(() => expect(screen.getByLabelText("Live dictation text")).toHaveProperty("value", "Recovered transcript."));
    expect(screen.getByText(/history could not be saved: History database locked/i)).toBeTruthy();
    expect(screen.getByText(/Copied to clipboard/i)).toBeTruthy();
  });

  it("keeps the transcript visible when paste fails after transcription", async () => {
    bridge.getPrivateFastStatus.mockResolvedValue(readyStatus);
    bridge.pasteText.mockRejectedValueOnce(new Error("Clipboard blocked"));

    render(<App />);

    await waitFor(() => expect(screen.getByText("Engine ready")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Start dictation" }));
    await waitFor(() => expect(media.startAudioRecording).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Stop dictation" }));

    await waitFor(() => expect(screen.getByLabelText("Live dictation text")).toHaveProperty("value", "Recovered transcript."));
    expect(screen.getByText(/could not be pasted or copied: Clipboard blocked/i)).toBeTruthy();
    expect(screen.getByText(/Transcript kept in Dictivo/i)).toBeTruthy();
  });
});
