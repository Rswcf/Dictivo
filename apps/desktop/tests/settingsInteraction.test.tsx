/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SettingsView } from "../src/components/SettingsView";
import type { HardwareProfile, PrivateFastModel, PrivateFastStatus, RunnableTiers } from "../src/lib/desktopBridge";

afterEach(() => cleanup());

const status: PrivateFastStatus = {
  ready: true,
  modelId: "small",
  modelName: "Small",
  message: "Local engine ready.",
  setupHint: ""
};

const models: PrivateFastModel[] = [
  {
    id: "small",
    label: "Small",
    useCase: "Default local dictation",
    speed: "Fast",
    quality: "Good",
    sizeLabel: "469 MB",
    notes: "Good first model.",
    installed: true,
    selected: true
  }
];

const hardware: HardwareProfile = {
  platform: "macos",
  arch: "arm64",
  cpuCores: 10,
  memoryTotalBytes: 16 * 1024 ** 3,
  accelerators: ["Metal"],
  performanceClass: "gpuHigh",
  recommendedModelId: "small",
  recommendedProfile: "quality",
  reason: "Apple Silicon GPU detected."
};

const runnableTiers: RunnableTiers = {
  fast: { modelId: "small", realtimeFactor: 0.5, predicted: false, downloaded: true, withinBudget: true },
  medium: { modelId: "small", realtimeFactor: 0.8, predicted: false, downloaded: true, withinBudget: true },
  slow: { modelId: "small", realtimeFactor: 1.2, predicted: true, downloaded: true, withinBudget: true },
  fingerprint: "fp",
  benchmarkedAt: "2026-05-13T00:00:00.000Z"
};

function props() {
  return {
    appVersion: "0.2.0",
    hotkeys: {
      dictation: "CommandOrControl+Shift+Space",
      pasteLast: "CommandOrControl+Shift+V",
      activationMode: "toggle" as const
    },
    localProcessing: {
      autoPolish: true,
      spokenPunctuation: true,
      fillerWords: true,
      smartCapitalization: true
    },
    permissions: {
      microphone: "granted",
      accessibility: "denied",
      pasteAutomation: "clipboard-only"
    },
    privateFastStatus: status,
    privateFastModels: models,
    privateFastOperation: "",
    runnableTiers,
    companionEnabled: true,
    companionAvatar: "dog" as const,
    hardwareProfile: hardware,
    onHotkeyChange: vi.fn(),
    onProcessingChange: vi.fn(),
    onCompanionEnabledChange: vi.fn(),
    onCompanionAvatarChange: vi.fn(),
    onModelAction: vi.fn(),
    onImportModel: vi.fn(),
    onRefreshNative: vi.fn(),
    onOpenPermissionSettings: vi.fn(),
    selectedTier: "medium" as const,
    rerunStatus: "idle" as const,
    rerunError: "",
    onTierChange: vi.fn(),
    onRerunBenchmark: vi.fn(),
    onOpenWizard: vi.fn()
  };
}

describe("SettingsView interactions", () => {
  it("records only global-safe hotkeys with a modifier", () => {
    const viewProps = props();
    render(<SettingsView {...viewProps} initialSection="hotkeys" />);

    fireEvent.click(screen.getAllByRole("button", { name: "Change" })[0]!);
    expect(screen.getByRole("button", { name: "Press keys..." })).toBeTruthy();

    fireEvent.keyDown(window, { key: "K" });
    expect(screen.getByText("Use Command, Control, or Alt with another key.")).toBeTruthy();
    expect(viewProps.onHotkeyChange).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "K", shiftKey: true });
    expect(screen.getByText("Use Command, Control, or Alt with another key.")).toBeTruthy();
    expect(viewProps.onHotkeyChange).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "K", ctrlKey: true, shiftKey: true });
    expect(viewProps.onHotkeyChange).toHaveBeenCalledWith("dictation", "CommandOrControl+Shift+K");
    expect(screen.queryByText("Use Command, Control, or Alt with another key.")).toBeNull();
  });

  it("prevents assigning the same shortcut to dictation and paste last", () => {
    const viewProps = props();
    render(<SettingsView {...viewProps} initialSection="hotkeys" />);

    fireEvent.click(screen.getAllByRole("button", { name: "Change" })[0]!);
    fireEvent.keyDown(window, { key: "V", ctrlKey: true, shiftKey: true });

    expect(screen.getByText("This shortcut is already assigned.")).toBeTruthy();
    expect(viewProps.onHotkeyChange).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "K", ctrlKey: true, shiftKey: true });
    expect(viewProps.onHotkeyChange).toHaveBeenCalledWith("dictation", "CommandOrControl+Shift+K");
  });

  it("cancels hotkey recording with Escape and changes activation mode", () => {
    const viewProps = props();
    render(<SettingsView {...viewProps} initialSection="hotkeys" />);

    fireEvent.click(screen.getAllByRole("button", { name: "Change" })[1]!);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(viewProps.onHotkeyChange).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: "Change" })).toHaveLength(2);

    fireEvent.change(screen.getByDisplayValue("Toggle"), { target: { value: "hold" } });
    expect(viewProps.onHotkeyChange).toHaveBeenCalledWith("activationMode", "hold");
  });

  it("updates processing toggles, companion settings, and privacy refresh", () => {
    const engineProps = props();
    render(<SettingsView {...engineProps} initialSection="engine" />);
    fireEvent.click(screen.getByText("Processing toggles"));
    fireEvent.click(screen.getByLabelText("Auto polish"));
    expect(engineProps.onProcessingChange).toHaveBeenCalledWith("autoPolish", false);
    cleanup();

    const companionProps = props();
    render(<SettingsView {...companionProps} initialSection="companion" />);
    fireEvent.click(screen.getByLabelText("Show floating companion"));
    expect(companionProps.onCompanionEnabledChange).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "Cat" }));
    expect(companionProps.onCompanionAvatarChange).toHaveBeenCalledWith("cat");
    cleanup();

    const privacyProps = props();
    render(<SettingsView {...privacyProps} initialSection="privacy" />);
    expect(screen.getByLabelText("App version").textContent).toContain("v0.2.0");
    expect(screen.getByText("Enable this permission in system settings before using the related workflow.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Open settings" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    expect(privacyProps.onOpenPermissionSettings).toHaveBeenCalledWith("accessibility");
    fireEvent.click(screen.getByRole("button", { name: "Refresh local status" }));
    expect(privacyProps.onRefreshNative).toHaveBeenCalledTimes(1);
  });
});
