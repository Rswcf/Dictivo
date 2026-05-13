/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { ModelManager } from "../src/components/ModelManager";
import type { HardwareProfile, PrivateFastModel, PrivateFastStatus, RunnableTiers } from "../src/lib/desktopBridge";

afterEach(() => cleanup());

const status: PrivateFastStatus = {
  ready: true,
  modelId: "medium",
  modelName: "Medium",
  message: "Local engine ready.",
  setupHint: ""
};

const hardwareProfile: HardwareProfile = {
  platform: "macos",
  arch: "arm64",
  cpuCores: 10,
  memoryTotalBytes: 16 * 1024 ** 3,
  accelerators: ["Metal"],
  performanceClass: "gpuHigh",
  recommendedModelId: "medium",
  recommendedProfile: "balanced",
  reason: "Apple Silicon GPU detected."
};

const models: PrivateFastModel[] = [
  {
    id: "small",
    label: "Small",
    useCase: "Fast local dictation",
    speed: "Fast",
    quality: "Good",
    sizeLabel: "469 MB",
    notes: "Good first model.",
    installed: true,
    selected: false
  },
  {
    id: "medium",
    label: "Medium",
    useCase: "Balanced local dictation",
    speed: "Medium",
    quality: "Better",
    sizeLabel: "1.5 GB",
    notes: "Recommended.",
    installed: true,
    selected: true
  },
  {
    id: "large-v3",
    label: "Large v3",
    useCase: "Highest accuracy",
    speed: "Slow",
    quality: "Highest",
    sizeLabel: "3.1 GB",
    notes: "Use when quality matters.",
    installed: false,
    selected: false
  }
];

const runnableTiers: RunnableTiers = {
  fast: { modelId: "small", realtimeFactor: 0.5, predicted: false, downloaded: true, withinBudget: true },
  medium: { modelId: "medium", realtimeFactor: 0.8, predicted: false, downloaded: true, withinBudget: true },
  slow: { modelId: "large-v3", realtimeFactor: 3.2, predicted: true, downloaded: false, withinBudget: false },
  fingerprint: "fp",
  benchmarkedAt: "2026-05-13T00:00:00.000Z"
};

function props(overrides: Partial<ComponentProps<typeof ModelManager>> = {}) {
  return {
    status,
    models,
    hardwareProfile,
    runnableTiers,
    operation: "",
    selectedTier: "medium" as const,
    rerunStatus: "idle" as const,
    rerunError: "",
    onModelAction: vi.fn(),
    onImportModel: vi.fn(),
    onRefresh: vi.fn(),
    onTierChange: vi.fn(),
    onRerunBenchmark: vi.fn(),
    onOpenWizard: vi.fn(),
    ...overrides
  };
}

describe("ModelManager interactions", () => {
  it("refreshes engine state and selects an installed tier immediately", () => {
    const viewProps = props();
    render(<ModelManager {...viewProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    expect(viewProps.onRefresh).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Fast tier/ }));
    expect(viewProps.onTierChange).toHaveBeenCalledWith("fast");
  });

  it("confirms downloaded-but-slow tier changes before switching", () => {
    const onTierChange = vi.fn();
    render(<ModelManager {...props({ onTierChange })} />);

    fireEvent.click(screen.getByRole("button", { name: /Quality tier/ }));
    expect(screen.getByRole("dialog", { name: "Quality may run slowly" })).toBeTruthy();
    expect(onTierChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Quality may run slowly" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Quality tier/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onTierChange).toHaveBeenCalledWith("slow");
  });

  it("confirms missing model downloads for in-budget tiers before switching", () => {
    const onTierChange = vi.fn();
    const inBudgetDownload: RunnableTiers = {
      ...runnableTiers,
      fast: { modelId: "small", realtimeFactor: 0.5, predicted: false, downloaded: false, withinBudget: true }
    };

    render(<ModelManager {...props({ runnableTiers: inBudgetDownload, onTierChange })} />);

    fireEvent.click(screen.getByRole("button", { name: /Fast tier/ }));
    const dialog = screen.getByRole("dialog", { name: "Download Fast?" });
    expect(dialog).toBeTruthy();
    expect(onTierChange).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Download" }));
    expect(onTierChange).toHaveBeenCalledWith("fast");
  });

  it("runs advanced catalog actions and imports a local model path", () => {
    const viewProps = props();
    render(<ModelManager {...viewProps} />);

    fireEvent.click(screen.getByText("Advanced — full model catalog"));
    expect(screen.getByText("Tier: Fast")).toBeTruthy();
    expect(screen.getByText("Tier: Medium")).toBeTruthy();
    expect(screen.getByText("Tier: Quality")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Import" })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    expect(viewProps.onModelAction).toHaveBeenCalledWith("select", "small");

    fireEvent.click(screen.getAllByRole("button", { name: /Delete/ })[0]!);
    const deleteDialog = screen.getByRole("dialog", { name: "Delete Small?" });
    expect(deleteDialog).toBeTruthy();
    expect(viewProps.onModelAction).not.toHaveBeenCalledWith("delete", "small");
    fireEvent.click(within(deleteDialog).getByRole("button", { name: "Delete" }));
    expect(viewProps.onModelAction).toHaveBeenCalledWith("delete", "small");

    fireEvent.click(screen.getByRole("button", { name: /Download/ }));
    expect(viewProps.onModelAction).toHaveBeenCalledWith("download", "large-v3");

    fireEvent.change(screen.getByLabelText("Model to import"), { target: { value: "large-v3" } });
    fireEvent.change(screen.getByLabelText("Model file path"), {
      target: { value: " /tmp/ggml-large-v3.bin " }
    });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(viewProps.onImportModel).toHaveBeenCalledWith("large-v3", "/tmp/ggml-large-v3.bin");
  });

  it("disables catalog actions while a model operation is running", () => {
    const { rerender } = render(<ModelManager {...props()} />);

    fireEvent.click(screen.getByText("Advanced — full model catalog"));
    fireEvent.click(screen.getAllByRole("button", { name: /Delete/ })[0]!);
    expect(screen.getByRole("dialog", { name: "Delete Small?" })).toBeTruthy();

    rerender(<ModelManager {...props({ operation: "download:large-v3" })} />);

    expect(screen.getByRole("button", { name: "Re-run setup" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Refresh status" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /Run setup wizard/ })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /Fast tier/ })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /Medium tier/ })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /Quality tier/ })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /Quality tier/ }).textContent).toContain("Downloading");
    expect(screen.queryByRole("dialog", { name: "Delete Small?" })).toBeNull();

    const downloadButton = screen.getByRole("button", { name: /Downloading/ });
    expect(downloadButton).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("Model to import")).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("Model file path")).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Import" })).toHaveProperty("disabled", true);
  });
});
