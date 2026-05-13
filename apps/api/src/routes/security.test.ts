import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildServer } from "../index.js";
import { config } from "../config.js";

describe("API security controls", () => {
  it("sets CORS only for the configured app origin", async () => {
    const app = buildServer();
    const response = await app.inject({
      method: "OPTIONS",
      url: "/health",
      headers: {
        origin: config.APP_BASE_URL,
        "access-control-request-method": "GET"
      }
    });
    await app.close();

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(config.APP_BASE_URL);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("rejects request bodies over the metadata-only body limit", async () => {
    const app = buildServer();
    const response = await app.inject({
      method: "POST",
      url: "/v1/usage/events",
      payload: {
        clientSessionId: "x".repeat(70_000),
        event: "dictation_completed",
        provider: "local-whisper",
        privacyMode: "local-only"
      }
    });
    await app.close();

    expect(response.statusCode).toBe(413);
  });

  it("rate limits repeated API calls from the same client", async () => {
    const app = buildServer();
    let lastStatus = 0;

    for (let index = 0; index < 121; index += 1) {
      const response = await app.inject({ method: "GET", url: "/health" });
      lastStatus = response.statusCode;
    }
    await app.close();

    expect(lastStatus).toBe(429);
  });

  it("requires a valid Stripe signature when webhook signing is configured", async () => {
    const originalSecret = config.STRIPE_WEBHOOK_SECRET;
    config.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
    const app = buildServer();
    const rawPayload = JSON.stringify({
      id: "evt_signed",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test" } }
    });
    const signedAt = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", config.STRIPE_WEBHOOK_SECRET)
      .update(`${signedAt}.${rawPayload}`, "utf8")
      .digest("hex");
    const expiredAt = signedAt - 1_000;
    const expiredSignature = createHmac("sha256", config.STRIPE_WEBHOOK_SECRET)
      .update(`${expiredAt}.${rawPayload}`, "utf8")
      .digest("hex");

    try {
      const missingSignature = await app.inject({
        method: "POST",
        url: "/v1/webhooks/stripe",
        headers: { "content-type": "application/json" },
        payload: rawPayload
      });
      const invalidSignature = await app.inject({
        method: "POST",
        url: "/v1/webhooks/stripe",
        headers: {
          "content-type": "application/json",
          "stripe-signature": `t=${signedAt},v1=invalid`
        },
        payload: rawPayload
      });
      const expiredSignatureResponse = await app.inject({
        method: "POST",
        url: "/v1/webhooks/stripe",
        headers: {
          "content-type": "application/json",
          "stripe-signature": `t=${expiredAt},v1=${expiredSignature}`
        },
        payload: rawPayload
      });
      const accepted = await app.inject({
        method: "POST",
        url: "/v1/webhooks/stripe",
        headers: {
          "content-type": "application/json",
          "stripe-signature": `t=${signedAt},v1=${signature}`
        },
        payload: rawPayload
      });

      expect(missingSignature.statusCode).toBe(400);
      expect(missingSignature.json()).toMatchObject({ error: "invalid_stripe_signature" });
      expect(invalidSignature.statusCode).toBe(400);
      expect(invalidSignature.json()).toMatchObject({ error: "invalid_stripe_signature" });
      expect(expiredSignatureResponse.statusCode).toBe(400);
      expect(expiredSignatureResponse.json()).toMatchObject({ error: "invalid_stripe_signature" });
      expect(accepted.statusCode).toBe(200);
      expect(accepted.json()).toEqual({ received: true });
    } finally {
      await app.close();
      config.STRIPE_WEBHOOK_SECRET = originalSecret;
    }
  });
});
