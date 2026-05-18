import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import { billingRoutes } from "./routes/billing.js";
import { cloudFastRoutes } from "./routes/cloudFast.js";
import { entitlementsRoutes } from "./routes/entitlements.js";
import { transcriptionRoutes } from "./routes/transcription.js";
import { usageRoutes } from "./routes/usage.js";
import { closePool } from "./lib/db.js";

export function buildServer() {
  const app = Fastify({
    logger:
      config.NODE_ENV === "test"
        ? false
        : {
            level: config.NODE_ENV === "production" ? "info" : "debug",
            redact: [
              "req.body",
              "req.headers.authorization",
              "req.headers.cookie",
              "req.headers.x-api-key"
            ]
          },
    bodyLimit: 64 * 1024
  });

  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
    const rawBody = body.toString("utf8");
    (request as { rawBody?: string }).rawBody = rawBody;
    if (!rawBody) {
      done(null, null);
      return;
    }

    try {
      done(null, JSON.parse(rawBody) as unknown);
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  app.register(cors, {
    origin: config.APP_BASE_URL,
    credentials: true
  });

  app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute"
  });

  app.register(async (routes) => {
    routes.get("/health", async () => ({
      ok: true,
      service: "dictivo-api",
      contentRetention: "none"
    }));

    routes.register(entitlementsRoutes);
    routes.register(transcriptionRoutes);
    routes.register(cloudFastRoutes);
    routes.register(usageRoutes);
    routes.register(billingRoutes);
  });

  return app;
}

if (process.env.NODE_ENV !== "test") {
  const app = buildServer();

  const shutdown = async () => {
    await app.close();
    await closePool();
  };

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());

  await app.listen({ port: config.PORT, host: "0.0.0.0" });
}
