import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { query } from "../lib/db.js";
import { stripe } from "../lib/stripe.js";

const checkoutSchema = z.object({
  email: z.string().email(),
  plan: z.enum(["pro-monthly"]).default("pro-monthly")
});

export const billingRoutes: FastifyPluginAsync = async (app) => {
  app.post("/v1/billing/checkout", async (request, reply) => {
    const parsed = checkoutSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid_checkout_request",
        issues: parsed.error.issues
      });
    }

    if (!stripe || !config.STRIPE_PRICE_PRO_MONTHLY) {
      return {
        mode: "test",
        checkoutUrl: `${config.APP_BASE_URL}/billing/mock-success?plan=${parsed.data.plan}`
      };
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: parsed.data.email,
      line_items: [{ price: config.STRIPE_PRICE_PRO_MONTHLY, quantity: 1 }],
      success_url: `${config.APP_BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.APP_BASE_URL}/billing/cancel`
    });

    return { mode: "stripe", checkoutUrl: session.url };
  });

  app.post("/v1/webhooks/stripe", async (request) => {
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
