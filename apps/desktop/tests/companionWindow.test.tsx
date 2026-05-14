/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CompanionWindow } from "../src/components/CompanionWindow";
import type { CompanionSnapshot } from "../src/lib/companion";

const tauri = vi.hoisted(() => {
  const listeners = new Map<string, (event: { payload: CompanionSnapshot }) => void>();
  return {
    listeners,
    emitTo: vi.fn().mockResolvedValue(undefined),
    hide: vi.fn().mockResolvedValue(undefined),
    listen: vi.fn((eventName: string, handler: (event: { payload: CompanionSnapshot }) => void) => {
      listeners.set(eventName, handler);
      return Promise.resolve(() => listeners.delete(eventName));
    }),
    startDragging: vi.fn().mockResolvedValue(undefined),
    setSize: vi.fn().mockResolvedValue(undefined),
    setPosition: vi.fn().mockResolvedValue(undefined),
    outerPosition: vi.fn().mockResolvedValue({ x: 200, y: 200 }),
    outerSize: vi.fn().mockResolvedValue({ width: 92, height: 92 }),
    primaryMonitor: vi.fn().mockResolvedValue({
      position: { x: 0, y: 0 },
      size: { width: 1440, height: 900 }
    })
  };
});

vi.mock("@tauri-apps/api/event", () => ({
  emitTo: tauri.emitTo,
  listen: tauri.listen
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    hide: tauri.hide,
    startDragging: tauri.startDragging,
    setSize: tauri.setSize,
    setPosition: tauri.setPosition,
    outerPosition: tauri.outerPosition,
    outerSize: tauri.outerSize
  }),
  primaryMonitor: () => tauri.primaryMonitor(),
  // Tests don't care about real logical-pixel math; a passthrough stub is
  // enough for the companion to call `new LogicalSize(w, h)` without throwing.
  LogicalSize: class LogicalSize {
    constructor(public width: number, public height: number) {}
  },
  PhysicalPosition: class PhysicalPosition {
    constructor(public x: number, public y: number) {}
  }
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  tauri.listeners.clear();
  tauri.emitTo.mockClear();
  tauri.hide.mockClear();
  tauri.listen.mockClear();
  tauri.startDragging.mockClear();
  tauri.setSize.mockClear();
  tauri.setPosition.mockClear();
  tauri.outerPosition.mockClear();
  tauri.outerSize.mockClear();
  tauri.primaryMonitor.mockClear();
});

describe("CompanionWindow", () => {
  it("renders the default idle state and supports drag/hide actions", async () => {
    render(<CompanionWindow />);

    await waitFor(() => expect(tauri.listen).toHaveBeenCalledWith("companion-state", expect.any(Function)));
    expect(screen.getByLabelText("Dictivo floating recording status").className).toContain("companion-shell--idle");
    expect(screen.getByRole("img", { name: "Cartoon dog" })).toBeTruthy();
    expect(screen.getByText("Standing by")).toBeTruthy();
    expect(screen.getByText(/(⌘⇧Space|Ctrl\+Shift\+Space) to record/)).toBeTruthy();

    // pointerDown alone is no longer enough to start a drag — the new
    // gesture machine waits for movement past 5 px (drag), >600 ms (long
    // press), or a short tap (toggle). Verify a clean pointerDown→Up with
    // no movement routes to the short-tap toggle path.
    const shell = screen.getByLabelText("Dictivo floating recording status");
    fireEvent.pointerDown(shell, { button: 0, clientX: 40, clientY: 40 });
    fireEvent.pointerUp(shell, { clientX: 40, clientY: 40 });
    expect(tauri.startDragging).not.toHaveBeenCalled();
    expect(tauri.emitTo).toHaveBeenCalledWith("main", "companion-toggle-dictation", {});

    // Movement past threshold should promote to a drag.
    fireEvent.pointerDown(shell, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(shell, { clientX: 140, clientY: 100 });
    await waitFor(() => expect(tauri.startDragging).toHaveBeenCalledTimes(1));

    const hideButton = screen.getByRole("button", { name: "Hide companion" });
    fireEvent.click(hideButton);

    expect(tauri.emitTo).toHaveBeenCalledWith("main", "companion-hide-requested", {});
    expect(tauri.hide).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes if the window unmounts before the native listener finishes registering", async () => {
    let resolveListen: ((cleanup: () => void) => void) | undefined;
    const cleanupListener = vi.fn();
    tauri.listen.mockImplementationOnce(() => {
      return new Promise((resolve) => {
        resolveListen = resolve;
      });
    });

    const { unmount } = render(<CompanionWindow />);

    await waitFor(() => expect(resolveListen).toBeTruthy());
    unmount();

    await act(async () => {
      resolveListen?.(cleanupListener);
    });

    expect(cleanupListener).toHaveBeenCalledTimes(1);
  });

  it("updates from companion-state events and shows the recording timer", async () => {
    render(<CompanionWindow />);
    await waitFor(() => expect(tauri.listeners.has("companion-state")).toBe(true));

    await emitCompanionState({
      avatar: "cat",
      phase: "recording",
      title: "Listening",
      detail: "CommandOrControl+Shift+Space to stop",
      recordingStartedAt: Date.now() - 65_000
    });

    expect(screen.getByLabelText("Dictivo floating recording status").className).toContain("companion-shell--recording");
    expect(screen.getByRole("img", { name: "Cartoon cat" })).toBeTruthy();
    expect(screen.getByText("Listening")).toBeTruthy();
    expect(screen.getByText("CommandOrControl+Shift+Space to stop")).toBeTruthy();
    expect(screen.getByText(/^01:0[4-6]$/)).toBeTruthy();
    // The state halo replaces the old emote badge; the recording-state aria
    // label on the avatar wrap is what assistive tech (and this test) now
    // reads to confirm the recording phase is reflected visually.
    expect(screen.getByLabelText("Dictivo is recording")).toBeTruthy();
  });

  it("renders processing, complete, and blocked/error visual states", async () => {
    render(<CompanionWindow />);
    await waitFor(() => expect(tauri.listeners.has("companion-state")).toBe(true));

    await emitCompanionState({
      avatar: "iris",
      phase: "processing",
      title: "Transcribing",
      detail: "Local engine is working"
    });
    expect(screen.getByLabelText("Dictivo floating recording status").className).toContain("companion-shell--processing");
    expect(screen.getByRole("img", { name: "Iris companion" })).toBeTruthy();
    expect(screen.getByLabelText("Dictivo is transcribing")).toBeTruthy();

    await emitCompanionState({
      avatar: "cat",
      phase: "complete",
      title: "Ready",
      detail: "8 words copied"
    });
    expect(screen.getByLabelText("Dictivo floating recording status").className).toContain("companion-shell--complete");
    expect(screen.getByRole("img", { name: "Cartoon cat" })).toBeTruthy();
    expect(screen.getByLabelText("Dictivo finished — transcript copied")).toBeTruthy();

    await emitCompanionState({
      avatar: "marcus",
      phase: "blocked",
      title: "Setup needed",
      detail: "",
      summary: "Open Local Engine settings"
    });
    expect(screen.getByLabelText("Dictivo floating recording status").className).toContain("companion-shell--blocked");
    expect(screen.getByRole("img", { name: "Marcus companion" })).toBeTruthy();
    expect(screen.getByText("Open Local Engine settings")).toBeTruthy();
    expect(screen.getByLabelText("Dictivo needs setup")).toBeTruthy();
  });

  it("renders a custom avatar image from companion state", async () => {
    render(<CompanionWindow />);
    await waitFor(() => expect(tauri.listeners.has("companion-state")).toBe(true));

    await emitCompanionState({
      avatar: "custom",
      customAvatarDataUrl: "data:image/png;base64,YXZhdGFy",
      customAvatarName: "avatar.png",
      phase: "idle",
      title: "Standing by",
      detail: "CommandOrControl+Shift+Space to record"
    });

    const image = screen.getByRole("img", { name: "Custom companion avatar: avatar.png" }) as HTMLImageElement;
    expect(image.getAttribute("src")).toBe("data:image/png;base64,YXZhdGFy");
    expect(image.className).toContain("companion-avatar--custom");
  });
});

async function emitCompanionState(overrides: Partial<CompanionSnapshot>) {
  const listener = tauri.listeners.get("companion-state");
  if (!listener) throw new Error("companion-state listener was not registered");
  await act(async () => {
    listener({
      payload: {
        enabled: true,
        avatar: "dog",
        phase: "idle",
        hotkey: "CommandOrControl+Shift+Space",
        title: "Standing by",
        detail: "CommandOrControl+Shift+Space to record",
        summary: "Local dictation is ready.",
        transcriptPreview: "",
        pasteStatus: "",
        wordCount: 0,
        ...overrides
      }
    });
  });
}
