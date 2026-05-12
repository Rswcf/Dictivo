import { describe, expect, it } from "vitest";
import { buildServer } from "../index.js";

describe("privacy guard", () => {
  it("rejects transcript content in metadata APIs", async () => {
    const app = buildServer();
    const response = await app.inject({
      method: "POST",
      url: "/v1/usage/events",
      payload: {
        clientSessionId: "abc",
        event: "dictation_completed",
        durationSeconds: 3,
        wordCount: 10,
        provider: "local-whisper",
        privacyMode: "local-only",
        transcriptText: "private"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "content_fields_not_allowed" });
  });

  it("accepts Vietnamese local-only dictation metadata", async () => {
    const app = buildServer();
    const response = await app.inject({
      method: "POST",
      url: "/v1/transcription/session",
      payload: {
        clientSessionId: "local-abc",
        provider: "local-whisper",
        privacyMode: "local-only",
        language: "vi",
        source: "microphone",
        mode: "message",
        platform: "macos"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ relayAllowed: false, contentRetention: "none" });
  });

  it("rejects legacy cloud provider metadata", async () => {
    const app = buildServer();
    const response = await app.inject({
      method: "POST",
      url: "/v1/transcription/session",
      payload: {
        clientSessionId: "legacy-cloud",
        provider: "openai",
        privacyMode: "local-only",
        language: "en",
        source: "microphone",
        mode: "message"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "invalid_session_metadata" });
  });
});
