/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { OnboardingWizard } from "../src/components/OnboardingWizard";

afterEach(() => cleanup());

vi.mock("../src/lib/desktopBridge", () => ({
  isTauriRuntime: () => false,
  getHardwareProfile: vi.fn().mockResolvedValue({
    platform: "macos", arch: "aarch64", cpuCores: 10,
    memoryTotalBytes: 17179869184, accelerators: ["metal"],
    performanceClass: "gpuHigh",
    recommendedModelId: "large-v3-turbo-q5_0", recommendedProfile: "quality",
    reason: ""
  }),
  detectGpu: vi.fn().mockResolvedValue([{ name: "Apple Silicon GPU (Metal)", vramBytes: 9_000_000_000 }]),
  downloadPrivateFastModel: vi.fn().mockResolvedValue({ ready: true, modelId: "large-v3-turbo-q5_0", modelName: "Large v3 Turbo Q5", message: "ok", setupHint: "" }),
  benchmarkTier: vi.fn().mockResolvedValue(0.85),
  writeRunnableTiers: vi.fn().mockResolvedValue(undefined)
}));

describe("OnboardingWizard", () => {
  it("renders step 1 hardware scan", async () => {
    render(<OnboardingWizard onComplete={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Looking at your computer/i)).toBeTruthy());
  });

  it("advances 1 → 2 → 3 → onComplete", async () => {
    const onComplete = vi.fn();
    render(<OnboardingWizard onComplete={onComplete} />);

    await waitFor(() => expect(screen.getByText(/Apple/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(screen.getByText(/Recommended/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /download/i }));

    await waitFor(() => expect(screen.getByText(/Ready/i)).toBeTruthy(), { timeout: 5000 });
    fireEvent.click(screen.getByRole("button", { name: /start dictating/i }));

    expect(onComplete).toHaveBeenCalled();
  });

  it("dismiss button fires onComplete early", async () => {
    const onComplete = vi.fn();
    render(<OnboardingWizard onComplete={onComplete} />);
    await waitFor(() => expect(screen.getByText(/Looking at your computer/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(onComplete).toHaveBeenCalled();
  });
});
