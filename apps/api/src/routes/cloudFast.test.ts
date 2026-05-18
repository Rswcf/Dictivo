import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "../index.js";

const audioBase64 = Buffer.from("wav").toString("base64");

describe("cloud fast proxy", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("requires a Cloud Fast entitlement before accepting audio", async () => {
    const app = buildServer();
    const response = await app.inject({
      method: "POST",
      url: "/v1/cloud-fast/transcribe",
      payload: requestPayload()
    });
    await app.close();

    expect(response.statusCode).toBe(402);
    expect(response.json()).toMatchObject({
      error: "cloud_fast_subscription_required",
      upgradeUrl: "http://localhost:1420/cloud-fast"
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("transcribes through Groq as the primary Cloud Fast provider", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ text: "Cloud transcript." }));
    const app = buildServer();

    const response = await app.inject({
      method: "POST",
      url: "/v1/cloud-fast/transcribe",
      headers: entitledHeaders(),
      payload: requestPayload()
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      text: "Cloud transcript.",
      fallbackUsed: false,
      privacyMode: "cloud-fast",
      contentRetention: "none"
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("api.groq.com/openai/v1/audio/transcriptions");
  });

  it("accepts auto language and lets the provider auto-detect audio", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ text: "你好世界" }));
    const app = buildServer();

    const response = await app.inject({
      method: "POST",
      url: "/v1/cloud-fast/transcribe",
      headers: entitledHeaders(),
      payload: requestPayload({ language: "auto" })
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const providerBody = vi.mocked(fetch).mock.calls[0][1]?.body as FormData;
    expect(providerBody.get("language")).toBeNull();
  });

  it("falls back to ElevenLabs when Groq returns a retryable error", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: "rate limited" }, 429))
      .mockResolvedValueOnce(jsonResponse({ text: "Backup transcript." }));
    const app = buildServer();

    const response = await app.inject({
      method: "POST",
      url: "/v1/cloud-fast/transcribe",
      headers: entitledHeaders(),
      payload: requestPayload()
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      text: "Backup transcript.",
      fallbackUsed: true
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain("api.elevenlabs.io/v1/speech-to-text");
  });

  it("rejects requests that would exceed the monthly Cloud Fast quota", async () => {
    const app = buildServer();
    const response = await app.inject({
      method: "POST",
      url: "/v1/cloud-fast/transcribe",
      headers: entitledHeaders({ used: "89999" }),
      payload: requestPayload({ durationSeconds: 10 })
    });
    await app.close();

    expect(response.statusCode).toBe(402);
    expect(response.json()).toMatchObject({
      error: "cloud_fast_quota_exceeded",
      monthlySecondsLimit: 90000
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects invalid Cloud Fast audio before calling providers", async () => {
    const app = buildServer();
    const response = await app.inject({
      method: "POST",
      url: "/v1/cloud-fast/transcribe",
      headers: entitledHeaders(),
      payload: requestPayload({ audioBase64: "not valid base64!" })
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "invalid_cloud_fast_audio"
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns a generic error when primary and fallback providers fail", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: "primary down" }, 500))
      .mockResolvedValueOnce(jsonResponse({ error: "fallback down" }, 500));
    const app = buildServer();

    const response = await app.inject({
      method: "POST",
      url: "/v1/cloud-fast/transcribe",
      headers: entitledHeaders(),
      payload: requestPayload()
    });
    await app.close();

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({
      error: "cloud_fast_transcription_failed",
      message: "Cloud Fast transcription failed. Try Local mode or retry in a moment."
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reports Cloud Fast entitlement metadata without provider choices", async () => {
    const app = buildServer();
    const response = await app.inject({
      method: "GET",
      url: "/v1/cloud-fast/entitlement",
      headers: entitledHeaders()
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      available: true,
      plan: "cloud-fast-monthly",
      priceUsdMonthly: "6.99",
      monthlySecondsLimit: 90000,
      privacyNotice: "Cloud Fast uploads audio to cloud transcription providers for faster results."
    });
    expect(JSON.stringify(response.json())).not.toMatch(/groq|elevenlabs/i);
  });
});

function requestPayload(overrides: Record<string, unknown> = {}) {
  return {
    clientSessionId: "cloud-fast-session",
    audioBase64,
    mimeType: "audio/wav",
    durationSeconds: 3,
    language: "en",
    mode: "message",
    platform: "macos",
    appVersion: "0.3.4",
    ...overrides
  };
}

function entitledHeaders(overrides: { used?: string } = {}) {
  return {
    "x-user-id": "cloud-user",
    "x-cloud-fast-entitled": "true",
    ...(overrides.used ? { "x-cloud-fast-used": overrides.used } : {})
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}
