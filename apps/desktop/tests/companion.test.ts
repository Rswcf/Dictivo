import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { buildCompanionSnapshot } from "../src/lib/companion";
import {
  COMPANION_SNAP_THRESHOLD,
  companionWindowPosition,
  snapToWorkAreaEdge,
  windowIntersectsWorkArea
} from "../src/lib/companionWindowPosition";

describe("floating companion state", () => {
  it("summarizes an active recording with the stop hotkey and timer source", () => {
    const snapshot = buildCompanionSnapshot({
      enabled: true,
      displayMode: "card",
      avatar: "cat",
      phase: "recording",
      hotkey: "CommandOrControl+Shift+Space",
      liveText: "Recording locally. Stop to transcribe with the on-device engine.",
      statusMessage: "",
      pasteStatus: "",
      recordingStartedAt: 123,
      language: "en"
    });

    expect(snapshot.title).toBe("Listening");
    expect(snapshot.detail).toBe("CommandOrControl+Shift+Space to stop");
    expect(snapshot.transcriptPreview).toBe("");
    expect(snapshot.recordingStartedAt).toBe(123);
  });

  it("shows completion word count and keeps a short transcript preview", () => {
    const snapshot = buildCompanionSnapshot({
      enabled: true,
      displayMode: "card",
      avatar: "dog",
      phase: "complete",
      hotkey: "CommandOrControl+Shift+Space",
      liveText: "Dictivo copied this local transcript into the clipboard.",
      statusMessage: "Local transcription completed with balanced profile.",
      pasteStatus: "Copied to clipboard",
      language: "en"
    });

    expect(snapshot.title).toBe("Transcript copied to clipboard");
    expect(snapshot.detail).toBe("8 words saved. Looking sharp!");
    expect(snapshot.summary).toBe("Dictivo copied this local transcript into the clipboard.");
    expect(snapshot.pasteStatus).toBe("Copied to clipboard");
  });

  it("summarizes processing, blocked, error, idle, and CJK completion states", () => {
    expect(
      buildCompanionSnapshot({
        enabled: true,
        displayMode: "card",
        avatar: "dog",
        phase: "processing",
        hotkey: "CommandOrControl+Shift+Space",
        liveText: "",
        statusMessage: "",
        pasteStatus: "",
        language: "en"
      })
    ).toMatchObject({
      title: "Transcribing",
      detail: "Local engine is working",
      summary: "Processing audio on this device."
    });

    expect(
      buildCompanionSnapshot({
        enabled: true,
        displayMode: "card",
        avatar: "dog",
        phase: "processing",
        hotkey: "CommandOrControl+Shift+Space",
        liveText: "",
        statusMessage: "Transcribing with Cloud Fast...",
        pasteStatus: "",
        language: "en"
      })
    ).toMatchObject({
      title: "Transcribing",
      detail: "Cloud Fast is working",
      summary: "Transcribing with Cloud Fast..."
    });

    expect(
      buildCompanionSnapshot({
        enabled: true,
        displayMode: "card",
        avatar: "dog",
        phase: "processing",
        hotkey: "CommandOrControl+Shift+Space",
        liveText: "",
        statusMessage: "Stopping recording as soon as the microphone is ready...",
        pasteStatus: "",
        language: "en"
      })
    ).toMatchObject({
      title: "Transcribing",
      detail: "Waiting for microphone",
      summary: "Stopping recording as soon as the microphone is ready..."
    });

    expect(
      buildCompanionSnapshot({
        enabled: true,
        displayMode: "card",
        avatar: "dog",
        phase: "blocked",
        hotkey: "CommandOrControl+Shift+Space",
        liveText: "",
        statusMessage: "",
        pasteStatus: "",
        language: "en"
      })
    ).toMatchObject({
      title: "Setup needed",
      detail: "Open Engine settings",
      summary: "Dictivo needs a local engine check."
    });

    expect(
      buildCompanionSnapshot({
        enabled: true,
        displayMode: "card",
        avatar: "dog",
        phase: "error",
        hotkey: "CommandOrControl+Shift+Space",
        liveText: "",
        statusMessage: "Microphone denied",
        pasteStatus: "",
        language: "en"
      })
    ).toMatchObject({
      title: "Needs attention",
      detail: "Microphone denied",
      summary: "Microphone denied"
    });

    expect(
      buildCompanionSnapshot({
        enabled: false,
        displayMode: "pet",
        avatar: "cat",
        phase: "idle",
        hotkey: "CommandOrControl+Shift+Space",
        liveText: "",
        statusMessage: "",
        pasteStatus: "",
        language: "en"
      })
    ).toMatchObject({
      enabled: false,
      title: "Standing by",
      detail: "CommandOrControl+Shift+Space to record",
      summary: "Local dictation is ready."
    });

    expect(
      buildCompanionSnapshot({
        enabled: true,
        displayMode: "card",
        avatar: "dog",
        phase: "complete",
        hotkey: "CommandOrControl+Shift+Space",
        liveText: "本地优先",
        statusMessage: "",
        pasteStatus: "",
        language: "zh"
      }).detail
    ).toBe("4 words saved. Looking sharp!");
  });

  it("truncates very long transcript previews", () => {
    const snapshot = buildCompanionSnapshot({
      enabled: true,
      displayMode: "card",
      avatar: "dog",
      phase: "complete",
      hotkey: "CommandOrControl+Shift+Space",
      liveText: "word ".repeat(80),
      statusMessage: "",
      pasteStatus: "",
      language: "en"
    });

    expect(snapshot.transcriptPreview.length).toBeLessThanOrEqual(118);
    expect(snapshot.transcriptPreview.endsWith("...")).toBe(true);
  });

  it("carries custom companion image data only for the custom avatar", () => {
    const customSnapshot = buildCompanionSnapshot({
      enabled: true,
      displayMode: "pet",
      avatar: "custom",
      customAvatarDataUrl: "data:image/png;base64,YXZhdGFy",
      customAvatarName: "avatar.png",
      phase: "idle",
      hotkey: "CommandOrControl+Shift+Space",
      liveText: "",
      statusMessage: "",
      pasteStatus: "",
      language: "en"
    });
    const builtInSnapshot = buildCompanionSnapshot({
      enabled: true,
      displayMode: "pet",
      avatar: "dog",
      customAvatarDataUrl: "data:image/png;base64,YXZhdGFy",
      customAvatarName: "avatar.png",
      phase: "idle",
      hotkey: "CommandOrControl+Shift+Space",
      liveText: "",
      statusMessage: "",
      pasteStatus: "",
      language: "en"
    });

    expect(customSnapshot.customAvatarDataUrl).toBe("data:image/png;base64,YXZhdGFy");
    expect(customSnapshot.customAvatarName).toBe("avatar.png");
    expect(builtInSnapshot.customAvatarDataUrl).toBeUndefined();
    expect(builtInSnapshot.customAvatarName).toBeUndefined();
  });

  it("does not ship the discontinued Trump companion avatar", () => {
    // Removed for v1.0 launch — politically polarizing characters were
    // incompatible with the serious-product positioning. The migration in
    // normalizeSettings ensures any user with the legacy "trump" choice
    // silently falls back to the default "dog" on next load.
    const componentSources = [
      readFileSync("src/components/CompanionWindow.tsx", "utf8"),
      readFileSync("src/components/DictationWorkbench.tsx", "utf8"),
      readFileSync("src/components/SettingsView.tsx", "utf8"),
      readFileSync("src/App.tsx", "utf8")
    ];
    for (const source of componentSources) {
      expect(source).not.toContain("trump-companion.png");
      expect(source).not.toContain("\"trump\"");
    }
  });
});

describe("floating companion window positioning", () => {
  it("anchors the companion near the top-right of the visible work area", () => {
    expect(
      companionWindowPosition({
        position: { x: 0, y: 0 },
        size: { width: 1440, height: 900 }
      }, { width: 360, height: 100 })
    ).toEqual({ x: 1056, y: 24 });
  });

  it("respects monitor origins on secondary displays", () => {
    expect(
      companionWindowPosition({
        position: { x: -1280, y: 80 },
        size: { width: 1280, height: 720 }
      }, { width: 360, height: 100 })
    ).toEqual({ x: -384, y: 104 });
  });

  it("keeps the window inside very small work areas", () => {
    expect(
      companionWindowPosition({
        position: { x: 40, y: 30 },
        size: { width: 300, height: 120 }
      }, { width: 360, height: 140 })
    ).toEqual({ x: 40, y: 30 });
  });

  it("uses a custom margin when supplied", () => {
    expect(
      companionWindowPosition(
        {
          position: { x: 10, y: 20 },
          size: { width: 1000, height: 600 }
        },
        { width: 320, height: 100 },
        12
      )
    ).toEqual({ x: 678, y: 32 });
  });
});

describe("snapToWorkAreaEdge — companion drag-end magnet", () => {
  const monitor = {
    position: { x: 0, y: 0 },
    size: { width: 1440, height: 900 }
  };
  const windowSize = { width: 92, height: 92 };

  it("returns null when the window is far from every edge", () => {
    expect(snapToWorkAreaEdge({ x: 600, y: 400 }, windowSize, monitor)).toBeNull();
  });

  it("snaps to the left edge when within threshold", () => {
    const snapped = snapToWorkAreaEdge({ x: 12, y: 400 }, windowSize, monitor);
    expect(snapped).toEqual({ x: 0, y: 400 });
  });

  it("snaps to the right edge when within threshold", () => {
    const snapped = snapToWorkAreaEdge({ x: 1320, y: 400 }, windowSize, monitor);
    expect(snapped).toEqual({ x: 1348, y: 400 }); // 1440 - 92 = 1348
  });

  it("snaps to the top edge when within threshold", () => {
    const snapped = snapToWorkAreaEdge({ x: 600, y: 16 }, windowSize, monitor);
    expect(snapped).toEqual({ x: 600, y: 0 });
  });

  it("snaps to the bottom-right corner when both edges are within threshold", () => {
    const snapped = snapToWorkAreaEdge({ x: 1330, y: 780 }, windowSize, monitor);
    expect(snapped).toEqual({ x: 1348, y: 808 }); // 1440-92, 900-92
  });

  it("ignores edges farther than the configurable threshold", () => {
    const snapped = snapToWorkAreaEdge({ x: 200, y: 400 }, windowSize, monitor, 50);
    expect(snapped).toBeNull();
  });

  it("clamps a snapped position to the rightmost valid origin", () => {
    // Window dragged slightly past the right edge (10 px beyond) — within
    // threshold, so we snap; the snap target is clamped to maxX so the
    // window never reports an off-screen origin.
    const snapped = snapToWorkAreaEdge({ x: 1358, y: 400 }, windowSize, monitor);
    expect(snapped).toEqual({ x: 1348, y: 400 });
  });

  it("exposes a sane default threshold", () => {
    expect(COMPANION_SNAP_THRESHOLD).toBeGreaterThan(0);
    expect(COMPANION_SNAP_THRESHOLD).toBeLessThanOrEqual(80);
  });
});

describe("windowIntersectsWorkArea", () => {
  const workArea = {
    position: { x: 0, y: 0 },
    size: { width: 1440, height: 900 }
  };
  const windowSize = { width: 360, height: 100 };

  it("accepts persisted companion positions with enough visible area", () => {
    expect(windowIntersectsWorkArea({ x: 1200, y: 24 }, windowSize, workArea)).toBe(true);
  });

  it("rejects positions restored fully off the current display", () => {
    expect(windowIntersectsWorkArea({ x: -900, y: 24 }, windowSize, workArea)).toBe(false);
  });

  it("allows a partially visible edge placement", () => {
    expect(windowIntersectsWorkArea({ x: 1410, y: 24 }, windowSize, workArea)).toBe(false);
    expect(windowIntersectsWorkArea({ x: 1408, y: 24 }, windowSize, workArea)).toBe(true);
  });
});
