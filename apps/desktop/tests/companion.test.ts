import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { buildCompanionSnapshot } from "../src/lib/companion";
import { companionWindowPosition } from "../src/lib/companionWindowPosition";

describe("floating companion state", () => {
  it("summarizes an active recording with the stop hotkey and timer source", () => {
    const snapshot = buildCompanionSnapshot({
      enabled: true,
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
      avatar: "dog",
      phase: "complete",
      hotkey: "CommandOrControl+Shift+Space",
      liveText: "Dictivo copied this local transcript into the clipboard.",
      statusMessage: "Local transcription completed with balanced profile.",
      pasteStatus: "Copied to clipboard",
      language: "en"
    });

    expect(snapshot.title).toBe("Ready");
    expect(snapshot.detail).toBe("8 words copied");
    expect(snapshot.summary).toBe("Dictivo copied this local transcript into the clipboard.");
    expect(snapshot.pasteStatus).toBe("Copied to clipboard");
  });

  it("summarizes processing, blocked, error, idle, and CJK completion states", () => {
    expect(
      buildCompanionSnapshot({
        enabled: true,
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
      detail: "Open Local Engine settings",
      summary: "Dictivo needs a local engine check."
    });

    expect(
      buildCompanionSnapshot({
        enabled: true,
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
      detail: "Check the main window",
      summary: "Microphone denied"
    });

    expect(
      buildCompanionSnapshot({
        enabled: false,
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
        avatar: "dog",
        phase: "complete",
        hotkey: "CommandOrControl+Shift+Space",
        liveText: "本地优先",
        statusMessage: "",
        pasteStatus: "",
        language: "zh"
      }).detail
    ).toBe("4 words copied");
  });

  it("truncates very long transcript previews", () => {
    const snapshot = buildCompanionSnapshot({
      enabled: true,
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
