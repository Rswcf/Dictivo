/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCloudFastEntitlement, runCloudFastDictation } from "../src/lib/cloudFastEngine";
import { DEFAULT_LOCAL_PROCESSING } from "../src/lib/settingsStore";

const entitlement = {
  available: true,
  plan: "cloud-fast-monthly",
  priceUsdMonthly: "6.99",
  monthlySecondsLimit: 90_000,
  monthlySecondsUsed: 30,
  renewsAt: "2026-06-01T00:00:00.000Z",
  upgradeUrl: "https://dictivo.app/cloud-fast",
  privacyNotice: "Cloud Fast uploads audio to cloud transcription providers for faster results."
};

describe("cloudFastEngine", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads Cloud Fast entitlement metadata from the Dictivo proxy", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => entitlement
    });

    await expect(getCloudFastEntitlement()).resolves.toEqual(entitlement);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8787/v1/cloud-fast/entitlement",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-user-id": expect.stringMatching(/^local-/) })
      })
    );
  });

  it("uploads only audio request fields to the proxy and applies local polish after transcription", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "dictivo raw cloud text", fallbackUsed: true })
    });

    const result = await runCloudFastDictation(new Blob(["wav"], { type: "audio/wav" }), {
      clientSessionId: "cloud_1",
      language: "en",
      dictionary: ["Dictivo"],
      snippets: [{ trigger: "calendar", replacement: "https://calendar.example" }],
      mode: "message",
      durationSeconds: 3,
      appVersion: "0.2.0",
      platform: "macos",
      localProcessing: DEFAULT_LOCAL_PROCESSING
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8787/v1/cloud-fast/transcribe",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "x-user-id": expect.stringMatching(/^local-/)
        })
      })
    );
    expect(body).toEqual(expect.objectContaining({
      clientSessionId: "cloud_1",
      audioBase64: "d2F2",
      mimeType: "audio/wav",
      durationSeconds: 3,
      language: "en",
      mode: "message",
      platform: "macos",
      appVersion: "0.2.0"
    }));
    expect(body).not.toHaveProperty("dictionary");
    expect(body).not.toHaveProperty("snippets");
    expect(result).toEqual({
      rawText: "dictivo raw cloud text",
      finalizedText: "Dictivo raw cloud text.",
      language: "en",
      fallbackUsed: true
    });
  });

  it("keeps auto language mode in proxy requests and resolves processing language from returned text", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "你好世界", fallbackUsed: false })
    });

    const result = await runCloudFastDictation(new Blob(["wav"], { type: "audio/wav" }), {
      clientSessionId: "cloud_auto",
      language: "auto",
      dictionary: [],
      snippets: [],
      mode: "message",
      durationSeconds: 2,
      appVersion: "0.3.4",
      platform: "macos",
      localProcessing: DEFAULT_LOCAL_PROCESSING
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body.language).toBe("auto");
    expect(result).toMatchObject({
      finalizedText: "你好世界。",
      language: "zh"
    });
  });

  it("surfaces an actionable message when an old Cloud Fast service rejects auto language", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "invalid_cloud_fast_request" })
    });

    await expect(runCloudFastDictation(new Blob(["wav"], { type: "audio/wav" }), {
      clientSessionId: "cloud_auto_error",
      language: "auto",
      dictionary: [],
      snippets: [],
      mode: "message",
      durationSeconds: 2,
      appVersion: "0.3.4",
      platform: "macos"
    })).rejects.toThrow("Cloud Fast service rejected automatic language detection.");
  });
});
