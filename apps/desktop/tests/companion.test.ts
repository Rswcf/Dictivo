import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
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

  it("ships the generated Trump companion avatar as a project asset", () => {
    const asset = statSync("src/assets/avatars/trump-companion.png");
    const header = readFileSync("src/assets/avatars/trump-companion.png").subarray(0, 8);
    const componentSource = readFileSync("src/components/CompanionWindow.tsx", "utf8");

    expect(asset.size).toBeGreaterThan(100_000);
    expect([...header]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(componentSource).toContain("trump-companion.png");
  });
});
