import { describe, expect, it } from "vitest";
import { buildServer } from "../index.js";

describe("metadata API routes", () => {
  it("reports health without content retention", async () => {
    const app = buildServer();
    const response = await app.inject({
      method: "GET",
      url: "/health"
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      service: "dictivo-api",
      contentRetention: "none"
    });
  });

  it("returns a safe default entitlement when no database row exists", async () => {
    const app = buildServer();
    const response = await app.inject({
      method: "GET",
      url: "/v1/entitlements",
      headers: {
        "x-user-id": "user_123"
      }
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      userId: "user_123",
      plan: "trial",
      monthlySecondsLimit: 1800,
      monthlySecondsUsed: 0
    });
  });

  it("accepts local-only usage metadata and rejects invalid usage events", async () => {
    const app = buildServer();
    const accepted = await app.inject({
      method: "POST",
      url: "/v1/usage/events",
      payload: {
        clientSessionId: "local-session",
        event: "dictation_completed",
        durationSeconds: 12,
        wordCount: 123,
        provider: "local-whisper",
        privacyMode: "local-only"
      }
    });
    const rejected = await app.inject({
      method: "POST",
      url: "/v1/usage/events",
      payload: {
        clientSessionId: "local-session",
        event: "cloud_relay_started",
        durationSeconds: -1,
        provider: "local-whisper",
        privacyMode: "local-only"
      }
    });
    await app.close();

    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({ accepted: true });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json()).toMatchObject({ error: "invalid_usage_event" });
  });

  it("rejects unknown metadata fields instead of silently stripping them", async () => {
    const app = buildServer();
    const session = await app.inject({
      method: "POST",
      url: "/v1/transcription/session",
      payload: {
        clientSessionId: "unknown-session-field",
        provider: "local-whisper",
        privacyMode: "local-only",
        language: "en",
        source: "microphone",
        mode: "message",
        utterance: "should not be accepted as metadata"
      }
    });
    const usage = await app.inject({
      method: "POST",
      url: "/v1/usage/events",
      payload: {
        clientSessionId: "unknown-usage-field",
        event: "dictation_completed",
        durationSeconds: 12,
        wordCount: 123,
        provider: "local-whisper",
        privacyMode: "local-only",
        note: "unexpected"
      }
    });
    await app.close();

    expect(session.statusCode).toBe(400);
    expect(session.json()).toMatchObject({ error: "invalid_session_metadata" });
    expect(usage.statusCode).toBe(400);
    expect(usage.json()).toMatchObject({ error: "invalid_usage_event" });
  });

  it("uses mock checkout when Stripe is not configured and validates email input", async () => {
    const app = buildServer();
    const accepted = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      payload: {
        email: "person@example.com",
        plan: "pro-monthly"
      }
    });
    const cloudFast = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      payload: {
        email: "person@example.com",
        plan: "cloud-fast-monthly"
      }
    });
    const rejected = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      payload: {
        email: "not-an-email",
        plan: "pro-monthly"
      }
    });
    await app.close();

    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({
      mode: "test",
      checkoutUrl: "http://localhost:1420/billing/mock-success?plan=pro-monthly"
    });
    expect(cloudFast.statusCode).toBe(200);
    expect(cloudFast.json()).toMatchObject({
      mode: "test",
      checkoutUrl: "http://localhost:1420/billing/mock-success?plan=cloud-fast-monthly"
    });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json()).toMatchObject({ error: "invalid_checkout_request" });
  });

  it("rejects unknown checkout fields instead of silently stripping them", async () => {
    const app = buildServer();
    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      payload: {
        email: "person@example.com",
        plan: "pro-monthly",
        notes: "unexpected"
      }
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "invalid_checkout_request" });
  });

  it("records Stripe webhook metadata without storing billing payload content", async () => {
    const app = buildServer();
    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/stripe",
      payload: {
        id: "evt_123",
        type: "checkout.session.completed",
        data: { object: { id: "cs_test" } }
      }
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true });
  });
});
