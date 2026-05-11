import { describe, expect, it } from "vitest";
import { buildCompanionSnapshot } from "../src/lib/companion";

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
});
