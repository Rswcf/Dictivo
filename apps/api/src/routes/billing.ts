import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { query } from "../lib/db.js";
import { rejectForbiddenContentFields } from "../lib/privacyGuard.js";
import { stripe } from "../lib/stripe.js";

const checkoutSchema = z.object({
  email: z.string().email(),
  plan: z.enum(["pro-monthly", "cloud-fast-monthly"]).default("pro-monthly")
}).strict();

const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

export const billingRoutes: FastifyPluginAsync = async (app) => {
  app.post("/v1/billing/checkout", { preHandler: rejectForbiddenContentFields }, async (request, reply) => {
    const parsed = checkoutSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid_checkout_request",
        issues: parsed.error.issues
      });
    }

    const priceId = parsed.data.plan === "cloud-fast-monthly"
      ? config.STRIPE_PRICE_CLOUD_FAST_MONTHLY
      : config.STRIPE_PRICE_PRO_MONTHLY;

    if (!stripe || !priceId) {
      return {
        mode: "test",
        checkoutUrl: `${config.APP_BASE_URL}/billing/mock-success?plan=${parsed.data.plan}`
      };
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: parsed.data.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${config.APP_BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.APP_BASE_URL}/billing/cancel`
    });

    return { mode: "stripe", checkoutUrl: session.url };
  });

  app.post("/v1/webhooks/stripe", { preHandler: [verifyStripeWebhookRequest, rejectForbiddenContentFields] }, async (request) => {
    const event = request.body as { id?: string; type?: string; data?: unknown };
    await query(
      `insert into billing_events (stripe_event_id, event_type, received_at)
       values ($1,$2,now())
       on conflict (stripe_event_id) do nothing`,
      [event.id ?? `local_${Date.now()}`, event.type ?? "unknown"]
    );

    return { received: true };
  });
};

function verifyStripeWebhookRequest(request: Parameters<typeof rejectForbiddenContentFields>[0], reply: Parameters<typeof rejectForbiddenContentFields>[1], done: () => void) {
  if (!config.STRIPE_WEBHOOK_SECRET) {
    done();
    return;
  }

  const signature = request.headers["stripe-signature"];
  const rawBody = (request as { rawBody?: string }).rawBody ?? JSON.stringify(request.body ?? {});
  if (typeof signature !== "string" || !verifyStripeSignature(rawBody, signature, config.STRIPE_WEBHOOK_SECRET)) {
    void reply.code(400).send({
      error: "invalid_stripe_signature",
      message: "Stripe webhook signature verification failed."
    });
    return;
  }

  done();
}

export function verifyStripeSignature(rawBody: string, signatureHeader: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const parsed = parseStripeSignatureHeader(signatureHeader);
  if (!parsed || Math.abs(nowSeconds - parsed.timestamp) > STRIPE_SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret)
    .update(`${parsed.timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  return parsed.signatures.some((signature) => safeEqualHex(signature, expected));
}

function parseStripeSignatureHeader(header: string) {
  const timestamps: number[] = [];
  const signatures: string[] = [];

  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t" && value) timestamps.push(Number(value));
    if (key === "v1" && value) signatures.push(value);
  }

  const timestamp = timestamps[0];
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || !signatures.length) return null;
  return { timestamp, signatures };
}

function safeEqualHex(actual: string, expected: string) {
  try {
    const actualBytes = Buffer.from(actual, "hex");
    const expectedBytes = Buffer.from(expected, "hex");
    return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
  } catch {
    return false;
  }
}
