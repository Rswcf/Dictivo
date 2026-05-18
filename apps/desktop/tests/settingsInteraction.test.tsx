/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const invokeMock = vi.hoisted(() => vi.fn());
const isTauriMock = vi.hoisted(() => vi.fn(() => false));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  isTauri: isTauriMock
}));

import { SettingsView } from "../src/components/SettingsView";
import type { HardwareProfile, PrivateFastModel, PrivateFastStatus, RunnableTiers } from "../src/lib/desktopBridge";

afterEach(() => {
  cleanup();
  invokeMock.mockReset();
  isTauriMock.mockReset();
  isTauriMock.mockReturnValue(false);
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  vi.unstubAllGlobals();
});

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

const cloudFastEntitlement = {
  available: false,
  plan: "unknown",
  priceUsdMonthly: "6.99",
  monthlySecondsLimit: 90_000,
  monthlySecondsUsed: 0,
  renewsAt: null,
  upgradeUrl: "https://dictivo.app/cloud-fast",
  privacyNotice: "Cloud Fast uploads audio to cloud transcription providers for faster results."
};

function props() {
  return {
    appVersion: "0.2.0",
    transcriptionMode: "local" as const,
    cloudFastEntitlement,
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
    companionDisplayMode: "card" as const,
    companionAvatar: "dog" as const,
    customCompanionAvatar: null,
    hardwareProfile: hardware,
    onHotkeyChange: vi.fn(),
    onTranscriptionModeChange: vi.fn(),
    onUpgradeCloudFast: vi.fn(),
    onProcessingChange: vi.fn(),
    onCompanionEnabledChange: vi.fn(),
    onCompanionDisplayModeChange: vi.fn(),
    onCompanionAvatarChange: vi.fn(),
    onCustomCompanionAvatarChange: vi.fn(),
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

  it("updates text cleanup toggles, companion settings, and privacy refresh", () => {
    const engineProps = props();
    render(<SettingsView {...engineProps} initialSection="engine" />);
    fireEvent.click(screen.getByText("Text cleanup"));
    fireEvent.click(screen.getByLabelText("Auto polish"));
    expect(engineProps.onProcessingChange).toHaveBeenCalledWith("autoPolish", false);
    cleanup();

    const companionProps = props();
    render(<SettingsView {...companionProps} initialSection="companion" />);
    fireEvent.click(screen.getByLabelText("Show floating companion"));
    expect(companionProps.onCompanionEnabledChange).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("radio", { name: /Animated pet/ }));
    expect(companionProps.onCompanionDisplayModeChange).toHaveBeenCalledWith("pet");
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

  it("shows local model settings only in Local mode and replaces them in Cloud Fast mode", () => {
    const localProps = props();
    const { rerender } = render(<SettingsView {...localProps} initialSection="engine" />);

    expect(screen.getByText("Local model setup")).toBeTruthy();
    expect(screen.getByText("Recommended for your hardware")).toBeTruthy();
    expect(screen.queryByText("Monthly usage")).toBeNull();

    rerender(<SettingsView {...localProps} transcriptionMode="cloud-fast" initialSection="engine" />);

    expect(screen.getByText("Cloud Fast subscription required")).toBeTruthy();
    expect(screen.getByText("Monthly usage")).toBeTruthy();
    expect(screen.queryByText("Recommended for your hardware")).toBeNull();
    expect(screen.queryByText("Advanced — full model catalog")).toBeNull();
    expect(screen.getByText("Text cleanup")).toBeTruthy();
  });

  it("uploads a custom companion avatar and selects it through settings", async () => {
    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      private listeners = new Map<string, Array<() => void>>();

      addEventListener(eventName: string, listener: () => void) {
        this.listeners.set(eventName, [...(this.listeners.get(eventName) ?? []), listener]);
      }

      readAsDataURL() {
        this.result = "data:image/png;base64,YXZhdGFy";
        this.listeners.get("load")?.forEach((listener) => listener());
      }
    }

    vi.stubGlobal("FileReader", MockFileReader);
    const viewProps = props();
    render(<SettingsView {...viewProps} initialSection="companion" />);

    fireEvent.change(screen.getByLabelText("Upload custom companion avatar"), {
      target: { files: [new File(["avatar"], "avatar.png", { type: "image/png" })] }
    });

    await waitFor(() => {
      expect(viewProps.onCustomCompanionAvatarChange).toHaveBeenCalledWith(expect.objectContaining({
        dataUrl: "data:image/png;base64,YXZhdGFy",
        name: "avatar.png"
      }));
    });
  });

  it("shows an inline error for unsupported custom avatar files", async () => {
    const viewProps = props();
    render(<SettingsView {...viewProps} initialSection="companion" />);

    fireEvent.change(screen.getByLabelText("Upload custom companion avatar"), {
      target: { files: [new File(["not image"], "avatar.txt", { type: "text/plain" })] }
    });

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("PNG, JPG, WebP, or GIF"));
    expect(viewProps.onCustomCompanionAvatarChange).not.toHaveBeenCalled();
  });

  it("activates Cloud Fast license separately and asks App to refresh entitlement", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    const absentLicense = {
      present: false,
      email: "",
      productName: "",
      createdAt: "",
      updatesUntil: "",
      daysRemaining: 0,
      status: "absent"
    };
    const activeCloudFastLicense = {
      present: true,
      email: "alice@example.com",
      productName: "Dictivo Cloud Fast",
      createdAt: "2026-05-16T10:00:00Z",
      updatesUntil: "2027-05-16T10:00:00Z",
      daysRemaining: 365,
      status: "active"
    };
    invokeMock.mockImplementation((command: string) => {
      if (command === "license_get" || command === "license_cloud_fast_get") return Promise.resolve(absentLicense);
      if (command === "license_cloud_fast_activate") return Promise.resolve(activeCloudFastLicense);
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const viewProps = { ...props(), onCloudFastLicenseChange: vi.fn().mockResolvedValue({ ...cloudFastEntitlement, available: true }) };
    render(<SettingsView {...viewProps} initialSection="license" />);

    fireEvent.change(screen.getByLabelText("Cloud Fast license key"), { target: { value: "CF-1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Activate Cloud Fast" }));

    await waitFor(() => expect(screen.getByText("Cloud Fast license activated.")).toBeTruthy());
    expect(invokeMock).toHaveBeenCalledWith("license_cloud_fast_activate", {
      licenseKey: "CF-1234",
      instanceName: expect.stringContaining("Dictivo Cloud Fast")
    });
    expect(viewProps.onCloudFastLicenseChange).toHaveBeenCalledTimes(1);
  });

  it("warns when an activated key does not unlock Cloud Fast entitlement", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    const absentLicense = {
      present: false,
      email: "",
      productName: "",
      createdAt: "",
      updatesUntil: "",
      daysRemaining: 0,
      status: "absent"
    };
    const wrongProductLicense = {
      present: true,
      email: "alice@example.com",
      productName: "Dictivo Local",
      createdAt: "2026-05-16T10:00:00Z",
      updatesUntil: "2027-05-16T10:00:00Z",
      daysRemaining: 365,
      status: "active"
    };
    invokeMock.mockImplementation((command: string) => {
      if (command === "license_get" || command === "license_cloud_fast_get") return Promise.resolve(absentLicense);
      if (command === "license_cloud_fast_activate") return Promise.resolve(wrongProductLicense);
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const viewProps = { ...props(), onCloudFastLicenseChange: vi.fn().mockResolvedValue({ ...cloudFastEntitlement, available: false }) };
    render(<SettingsView {...viewProps} initialSection="license" />);

    fireEvent.change(screen.getByLabelText("Cloud Fast license key"), { target: { value: "LOCAL-1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Activate Cloud Fast" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Cloud Fast access was not confirmed"));
    expect(screen.queryByText("Cloud Fast license activated.")).toBeNull();
    expect(viewProps.onCloudFastLicenseChange).toHaveBeenCalledTimes(1);
  });

  it("shows Account & Billing controls for an active Cloud Fast subscription", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    const absentLicense = {
      present: false,
      email: "",
      productName: "",
      createdAt: "",
      updatesUntil: "",
      daysRemaining: 0,
      status: "absent"
    };
    const activeCloudFastLicense = {
      present: true,
      email: "alice@example.com",
      productName: "Dictivo Cloud Fast",
      createdAt: "2026-05-16T10:00:00Z",
      updatesUntil: "2027-05-16T10:00:00Z",
      daysRemaining: 365,
      status: "active"
    };
    invokeMock.mockImplementation((command: string) => {
      if (command === "license_get") return Promise.resolve(absentLicense);
      if (command === "license_cloud_fast_get") return Promise.resolve(activeCloudFastLicense);
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const onManageCloudFastBilling = vi.fn();
    render(
      <SettingsView
        {...props()}
        transcriptionMode="cloud-fast"
        cloudFastEntitlement={{ ...cloudFastEntitlement, available: true, plan: "cloud-fast-monthly", upgradeUrl: null }}
        initialSection="license"
        onManageCloudFastBilling={onManageCloudFastBilling}
      />
    );

    await waitFor(() => expect(screen.getAllByText("alice@example.com").length).toBeGreaterThan(0));
    expect(screen.getByRole("heading", { name: "Account & Billing" })).toBeTruthy();
    expect(screen.getByText("Signed in for billing")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Manage subscription" })[0]!);
    expect(onManageCloudFastBilling).toHaveBeenCalledTimes(1);
  });

  it("offers to move a Cloud Fast key saved in the local license slot", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    const absentLicense = {
      present: false,
      email: "",
      productName: "",
      createdAt: "",
      updatesUntil: "",
      daysRemaining: 0,
      status: "absent"
    };
    const activeCloudFastLicense = {
      present: true,
      email: "alice@example.com",
      productName: "Dictivo Cloud Fast",
      createdAt: "2026-05-16T10:00:00Z",
      updatesUntil: "2027-05-16T10:00:00Z",
      daysRemaining: 365,
      status: "active"
    };
    let moved = false;
    invokeMock.mockImplementation((command: string) => {
      if (command === "license_get") return Promise.resolve(moved ? absentLicense : activeCloudFastLicense);
      if (command === "license_cloud_fast_get") return Promise.resolve(absentLicense);
      if (command === "license_cloud_fast_migrate_from_local") {
        moved = true;
        return Promise.resolve(activeCloudFastLicense);
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const viewProps = { ...props(), onCloudFastLicenseChange: vi.fn().mockResolvedValue({ ...cloudFastEntitlement, available: true }) };
    render(<SettingsView {...viewProps} initialSection="license" />);

    await waitFor(() => expect(screen.getByText("This Cloud Fast subscription is saved in the Local license slot, so Cloud Fast is still locked.")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Move to Cloud Fast license" }));

    await waitFor(() => expect(screen.getByText("Cloud Fast license moved and activated.")).toBeTruthy());
    expect(invokeMock).toHaveBeenCalledWith("license_cloud_fast_migrate_from_local");
    expect(viewProps.onCloudFastLicenseChange).toHaveBeenCalledTimes(1);
  });

  it("warns when a Cloud Fast key is pasted into the local license field", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    const absentLicense = {
      present: false,
      email: "",
      productName: "",
      createdAt: "",
      updatesUntil: "",
      daysRemaining: 0,
      status: "absent"
    };
    const activeCloudFastLicense = {
      present: true,
      email: "alice@example.com",
      productName: "Dictivo Cloud Fast",
      createdAt: "2026-05-16T10:00:00Z",
      updatesUntil: "2027-05-16T10:00:00Z",
      daysRemaining: 365,
      status: "active"
    };
    invokeMock.mockImplementation((command: string) => {
      if (command === "license_get" || command === "license_cloud_fast_get") return Promise.resolve(absentLicense);
      if (command === "license_activate") return Promise.resolve(activeCloudFastLicense);
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    render(<SettingsView {...props()} initialSection="license" />);

    fireEvent.change(screen.getByLabelText("License key"), { target: { value: "CF-1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("This is a Cloud Fast license"));
    expect(screen.queryByText(/Activated\. Updates included/)).toBeNull();
  });

  it("automatically activates Cloud Fast license keys delivered by deep link", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    const absentLicense = {
      present: false,
      email: "",
      productName: "",
      createdAt: "",
      updatesUntil: "",
      daysRemaining: 0,
      status: "absent"
    };
    const activeCloudFastLicense = {
      present: true,
      email: "alice@example.com",
      productName: "Dictivo Cloud Fast",
      createdAt: "2026-05-16T10:00:00Z",
      updatesUntil: "2027-05-16T10:00:00Z",
      daysRemaining: 365,
      status: "active"
    };
    invokeMock.mockImplementation((command: string) => {
      if (command === "license_get" || command === "license_cloud_fast_get") return Promise.resolve(absentLicense);
      if (command === "license_cloud_fast_activate") return Promise.resolve(activeCloudFastLicense);
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const viewProps = {
      ...props(),
      onCloudFastLicenseKeyConsumed: vi.fn(),
      onCloudFastLicenseChange: vi.fn().mockResolvedValue({ ...cloudFastEntitlement, available: true })
    };
    render(
      <SettingsView
        {...viewProps}
        initialSection="license"
        pendingCloudFastLicenseKey="CF-DEEP-LINK"
      />
    );

    await waitFor(() => expect(screen.getByText("Cloud Fast activated. Account & Billing is ready.")).toBeTruthy());
    expect(invokeMock).toHaveBeenCalledWith("license_cloud_fast_activate", {
      licenseKey: "CF-DEEP-LINK",
      instanceName: expect.stringContaining("Dictivo Cloud Fast")
    });
    expect(viewProps.onCloudFastLicenseChange).toHaveBeenCalledTimes(1);
    expect(viewProps.onCloudFastLicenseKeyConsumed).toHaveBeenCalledTimes(1);
  });
});
