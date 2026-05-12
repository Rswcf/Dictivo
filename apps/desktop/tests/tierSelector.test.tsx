/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { TierSelector } from "../src/components/TierSelector";
import type { RunnableTiers } from "../src/lib/desktopBridge";

afterEach(cleanup);

const oneTier: RunnableTiers = {
  fast: { modelId: "tiny", realtimeFactor: 0.4, predicted: true, downloaded: true },
  medium: null,
  slow: null,
  fingerprint: "x",
  benchmarkedAt: ""
};

const threeTiers: RunnableTiers = {
  fast: { modelId: "small", realtimeFactor: 0.65, predicted: true, downloaded: true },
  medium: { modelId: "large-v3-turbo-q5_0", realtimeFactor: 0.85, predicted: false, downloaded: true },
  slow: { modelId: "large-v3", realtimeFactor: 2.1, predicted: true, downloaded: false },
  fingerprint: "x",
  benchmarkedAt: ""
};

describe("TierSelector", () => {
  it("renders only available tiers (1)", () => {
    render(<TierSelector tiers={oneTier} selected="fast" onSelect={() => {}} />);
    expect(screen.getByRole("radio", { name: /Fast/ })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /Medium/ })).toBeNull();
    expect(screen.queryByRole("radio", { name: /Slow/ })).toBeNull();
  });

  it("renders all three when available", () => {
    render(<TierSelector tiers={threeTiers} selected="medium" onSelect={() => {}} />);
    expect(screen.getByRole("radio", { name: /Fast/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Medium/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Slow/ })).toBeTruthy();
  });

  it("calls onSelect with tier id", () => {
    const onSelect = vi.fn();
    render(<TierSelector tiers={threeTiers} selected="medium" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("radio", { name: /Fast/ }));
    expect(onSelect).toHaveBeenCalledWith("fast");
  });
});
