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

  it("rejects content aliases before schema stripping can hide them", async () => {
    const app = buildServer();
    const response = await app.inject({
      method: "POST",
      url: "/v1/transcription/session",
      payload: {
        clientSessionId: "alias-content",
        provider: "local-whisper",
        privacyMode: "local-only",
        language: "en",
        source: "microphone",
        mode: "message",
        content: "private dictation",
        transcript_text: "private snake case",
        prompt_terms: ["private name"]
      }
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "content_fields_not_allowed",
      fields: ["content", "prompt_terms", "transcript_text"]
    });
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

  it("rejects forbidden content fields on billing routes too", async () => {
    const app = buildServer();
    const checkout = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      payload: {
        email: "person@example.com",
        plan: "pro-monthly",
        transcriptText: "private dictation"
      }
    });
    const webhook = await app.inject({
      method: "POST",
      url: "/v1/webhooks/stripe",
      payload: {
        id: "evt_private",
        type: "checkout.session.completed",
        data: { object: { dictionary: ["private term"] } }
      }
    });
    await app.close();

    expect(checkout.statusCode).toBe(400);
    expect(checkout.json()).toMatchObject({
      error: "content_fields_not_allowed",
      fields: ["transcriptText"]
    });
    expect(webhook.statusCode).toBe(400);
    expect(webhook.json()).toMatchObject({
      error: "content_fields_not_allowed",
      fields: ["data.object.dictionary"]
    });
  });
});
