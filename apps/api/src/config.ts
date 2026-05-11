import "dotenv/config";
import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().optional(),
  APP_BASE_URL: z.string().url().default("http://localhost:1420"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional()
});

export const config = configSchema.parse(process.env);
