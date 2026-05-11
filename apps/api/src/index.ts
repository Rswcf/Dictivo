import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import { billingRoutes } from "./routes/billing.js";
import { entitlementsRoutes } from "./routes/entitlements.js";
import { transcriptionRoutes } from "./routes/transcription.js";
import { usageRoutes } from "./routes/usage.js";
import { closePool } from "./lib/db.js";

export function buildServer() {
  const app = Fastify({
    logger: {
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

  app.register(cors, {
    origin: config.APP_BASE_URL,
    credentials: true
  });

  app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute"
  });

  app.get("/health", async () => ({
    ok: true,
    service: "dictivo-api",
    contentRetention: "none"
  }));

  app.register(entitlementsRoutes);
  app.register(transcriptionRoutes);
  app.register(usageRoutes);
  app.register(billingRoutes);

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
