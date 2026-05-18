import { afterEach, describe, expect, it, vi } from "vitest";
import { runLocalDictation, type LocalDictationOptions } from "../src/lib/localDictationEngine";

const bridge = vi.hoisted(() => ({
  transcribePrivateFast: vi.fn()
}));

vi.mock("../src/lib/desktopBridge", () => ({
  transcribePrivateFast: bridge.transcribePrivateFast
}));

const audio = new Blob(["wav"], { type: "audio/wav" });
const options: LocalDictationOptions = {
  language: "en",
  dictionary: ["Dictivo"],
  snippets: [{ trigger: "calendar link", replacement: "https://example.test/calendar" }],
  mode: "message",
  profile: "balanced"
};

describe("local dictation engine", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("transcribes with the requested profile and applies local polish", async () => {
    bridge.transcribePrivateFast.mockResolvedValueOnce("um dictivo comma calendar link");

    await expect(runLocalDictation(audio, options)).resolves.toMatchObject({
      rawText: "um dictivo comma calendar link",
      finalizedText: "Dictivo, https://example.test/calendar.",
      language: "en",
      profileUsed: "balanced",
      fallbackUsed: false
    });

    expect(bridge.transcribePrivateFast).toHaveBeenCalledWith(
      audio,
      expect.objectContaining({ profile: "balanced", source: "microphone" })
    );
  });

  it("falls back to fast when a slower local profile fails", async () => {
    bridge.transcribePrivateFast
      .mockRejectedValueOnce(new Error("quality model failed"))
      .mockResolvedValueOnce("dictivo fallback worked");

    await expect(runLocalDictation(audio, { ...options, profile: "quality" })).resolves.toMatchObject({
      rawText: "dictivo fallback worked",
      finalizedText: "Dictivo fallback worked.",
      profileUsed: "fast",
      fallbackUsed: true
    });

    expect(bridge.transcribePrivateFast).toHaveBeenNthCalledWith(
      1,
      audio,
      expect.objectContaining({ profile: "quality" })
    );
    expect(bridge.transcribePrivateFast).toHaveBeenNthCalledWith(
      2,
      audio,
      expect.objectContaining({ profile: "fast" })
    );
  });

  it("does not hide failures when the fast profile fails", async () => {
    bridge.transcribePrivateFast.mockRejectedValueOnce(new Error("fast model missing"));

    await expect(runLocalDictation(audio, { ...options, profile: "fast" })).rejects.toThrow("fast model missing");
    expect(bridge.transcribePrivateFast).toHaveBeenCalledTimes(1);
  });

  it("lets local transcription auto-detect input language before cleanup", async () => {
    bridge.transcribePrivateFast.mockResolvedValueOnce("你好世界");

    await expect(runLocalDictation(audio, { ...options, language: "auto" })).resolves.toMatchObject({
      finalizedText: "你好世界。",
      language: "zh"
    });

    expect(bridge.transcribePrivateFast).toHaveBeenCalledWith(
      audio,
      expect.objectContaining({ language: "auto" })
    );
  });

  it("reports a slow warning for non-fast profiles that exceed the latency budget", async () => {
    vi.spyOn(performance, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(32_500);
    bridge.transcribePrivateFast.mockResolvedValueOnce("slow but successful");

    await expect(runLocalDictation(audio, options)).resolves.toMatchObject({
      finalizedText: "Slow but successful.",
      slowWarning: "This local pass was slow. Switch to Fast profile or a lighter model for lower latency."
    });
  });
});
