import "dotenv/config";
import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().optional(),
  APP_BASE_URL: z.string().url().default("http://localhost:1420"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),
  STRIPE_PRICE_CLOUD_FAST_MONTHLY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  CLOUD_FAST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  CLOUD_FAST_MONTHLY_SECONDS: z.coerce.number().int().positive().default(90_000)
});

export const config = configSchema.parse(process.env);
