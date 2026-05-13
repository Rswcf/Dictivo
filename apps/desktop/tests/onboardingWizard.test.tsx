/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OnboardingWizard } from "../src/components/OnboardingWizard";
import { benchmarkTier, detectGpu, downloadPrivateFastModel, getHardwareProfile, getPrivateFastModels } from "../src/lib/desktopBridge";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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
  finalizeCalibration: vi.fn().mockResolvedValue({
    fast: { modelId: "small", realtimeFactor: 0.4, predicted: true, downloaded: false, withinBudget: true },
    medium: { modelId: "large-v3-turbo-q5_0", realtimeFactor: 0.85, predicted: false, downloaded: true, withinBudget: true },
    slow: { modelId: "large-v3", realtimeFactor: 1.5, predicted: true, downloaded: false, withinBudget: true },
    fingerprint: "fp-test",
    benchmarkedAt: "2026-05-12T00:00:00Z"
  }),
  getPrivateFastModels: vi.fn().mockResolvedValue([
    { id: "large-v3-turbo-q5_0", label: "Large v3 Turbo Q5", useCase: "", speed: "", quality: "", sizeLabel: "~600 MB", notes: "", installed: true, selected: true }
  ])
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

    await waitFor(() => expect(screen.getByText(/Recommended for your hardware/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /download/i }));

    await waitFor(() => expect(screen.getByText(/Ready/i)).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByText(/Fast and Quality are also available/i)).toBeTruthy();
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

	  it("shows hardware scan failures without trapping the user", async () => {
	    vi.mocked(getHardwareProfile).mockRejectedValueOnce(new Error("Hardware scan failed"));
	    const onComplete = vi.fn();
	    render(<OnboardingWizard onComplete={onComplete} />);

    expect((await screen.findByRole("alert")).textContent).toContain("Hardware scan failed");
    expect(screen.getByRole("button", { name: /continue/i })).toHaveProperty("disabled", true);
	    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
	    expect(onComplete).toHaveBeenCalledTimes(1);
	  });

  it("continues hardware setup when optional GPU detection fails", async () => {
    vi.mocked(detectGpu).mockRejectedValueOnce(new Error("GPU probe unavailable"));
	    render(<OnboardingWizard onComplete={() => {}} />);

	    await waitFor(() => expect(screen.getByText(/CPU · 10 cores/i)).toBeTruthy());
	    expect(screen.getByText(/GPU · Not detected/i)).toBeTruthy();
	    expect(screen.queryByRole("alert")).toBeNull();

	    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(screen.getByText(/Recommended for your hardware/i)).toBeTruthy());
  });

  it("surfaces model catalog failures without blocking setup", async () => {
    vi.mocked(getPrivateFastModels).mockRejectedValueOnce(new Error("catalog unavailable"));
    render(<OnboardingWizard onComplete={() => {}} />);

    await waitFor(() => expect(screen.getByText(/Apple/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect((await screen.findByRole("status")).textContent).toContain("Model details are unavailable");
    expect(screen.getByText(/large-v3-turbo-q5_0/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /download/i })).toHaveProperty("disabled", false);
  });

  it("shows an explicit retry action after setup failure", async () => {
	    vi.mocked(downloadPrivateFastModel).mockRejectedValueOnce(new Error("Not enough disk space"));
	    render(<OnboardingWizard onComplete={() => {}} />);

    await waitFor(() => expect(screen.getByText(/Apple/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /download/i }));

	    expect((await screen.findByRole("alert")).textContent).toContain("Not enough disk space");
	    fireEvent.click(screen.getByRole("button", { name: /try setup again/i }));

	    await waitFor(() => expect(screen.getByText(/Ready/i)).toBeTruthy(), { timeout: 5000 });
	  });

	  it("does not allow skipping while setup is running", async () => {
	    let finishDownload: (value: unknown) => void = () => {};
	    vi.mocked(downloadPrivateFastModel).mockReturnValueOnce(
	      new Promise((resolve) => {
	        finishDownload = resolve;
	      })
	    );
	    render(<OnboardingWizard onComplete={() => {}} />);

	    await waitFor(() => expect(screen.getByText(/Apple/i)).toBeTruthy());
	    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
	    fireEvent.click(screen.getByRole("button", { name: /download/i }));

	    expect(screen.getByRole("button", { name: /skip setup/i })).toHaveProperty("disabled", true);
	    finishDownload({ ready: true, modelId: "large-v3-turbo-q5_0", modelName: "Large v3 Turbo Q5", message: "ok", setupHint: "" });
	    await waitFor(() => expect(screen.getByText(/Ready/i)).toBeTruthy(), { timeout: 5000 });
	  });

  it("stops setup side effects after unmounting during model download", async () => {
    let finishDownload: (value: unknown) => void = () => {};
    vi.mocked(downloadPrivateFastModel).mockReturnValueOnce(
      new Promise((resolve) => {
        finishDownload = resolve;
      })
    );

    const { unmount } = render(<OnboardingWizard onComplete={() => {}} />);

    await waitFor(() => expect(screen.getByText(/Apple/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /download/i }));
    unmount();

    await act(async () => {
      finishDownload({ ready: true, modelId: "large-v3-turbo-q5_0", modelName: "Large v3 Turbo Q5", message: "ok", setupHint: "" });
    });

    expect(benchmarkTier).not.toHaveBeenCalled();
  });

	  it("returns to the model step with retry when calibration fails", async () => {
    vi.mocked(benchmarkTier).mockRejectedValueOnce(new Error("Benchmark timed out"));
    render(<OnboardingWizard onComplete={() => {}} />);

    await waitFor(() => expect(screen.getByText(/Apple/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /download/i }));

    expect((await screen.findByRole("alert")).textContent).toContain("Benchmark timed out");
    expect(screen.getByText(/Recommended for your hardware/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /try setup again/i })).toBeTruthy();
  });
});
