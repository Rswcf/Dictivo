import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { TRANSCRIPTION_LANGUAGES } from "@dictivo/shared";
import { z } from "zod";
import { config } from "../config.js";
import { pool, query } from "../lib/db.js";
import { transcribeCloudFast } from "../lib/cloudFastProviders.js";

const CLOUD_FAST_PLANS = new Set(["cloud-fast-monthly", "pro-monthly", "cloud-fast"]);
const CLOUD_FAST_PRICE_USD_MONTHLY = "6.99";
const cloudFastSchema = z.object({
  clientSessionId: z.string().min(1).max(120),
  audioBase64: z.string().min(1).max(32 * 1024 * 1024),
  mimeType: z.string().min(1).max(120).default("audio/wav"),
  durationSeconds: z.number().positive().max(60 * 60),
  language: z.enum(TRANSCRIPTION_LANGUAGES),
  mode: z.enum(["dictation", "email", "message", "raw", "prompt"]),
  platform: z.enum(["macos", "windows", "linux", "web"]).optional(),
  appVersion: z.string().max(60).optional()
}).strict();

type EntitlementRow = {
  user_id: string;
  plan: string;
  monthly_seconds_limit: number;
  monthly_seconds_used: number;
  renews_at: Date | string;
};

export const cloudFastRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/cloud-fast/entitlement", async (request) => {
    const userId = userIdFromRequest(request);
    const entitlement = await readCloudFastEntitlement(request, userId);
    return entitlementResponse(userId, entitlement);
  });

  app.post("/v1/cloud-fast/transcribe", { bodyLimit: 36 * 1024 * 1024 }, async (request, reply) => {
    const parsed = cloudFastSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid_cloud_fast_request",
        issues: parsed.error.issues
      });
    }

    const userId = userIdFromRequest(request);
    const entitlement = await readCloudFastEntitlement(request, userId);
    if (!entitlement.available) {
      return reply.code(402).send({
        error: "cloud_fast_subscription_required",
        message: "Cloud Fast requires an active $6.99/month subscription.",
        upgradeUrl: cloudFastUpgradeUrl()
      });
    }

    const audioBytes = decodeCloudFastAudio(parsed.data.audioBase64);
    if (!audioBytes) {
      return reply.code(400).send({
        error: "invalid_cloud_fast_audio",
        message: "Audio must be valid base64."
      });
    }

    const reserved = await reserveCloudFastSeconds(request, userId, parsed.data.durationSeconds);
    if (!reserved.available) {
      return reply.code(402).send({
        error: "cloud_fast_quota_exceeded",
        message: "Cloud Fast monthly transcription minutes are exhausted.",
        monthlySecondsLimit: reserved.monthlySecondsLimit,
        monthlySecondsUsed: reserved.monthlySecondsUsed
      });
    }

    try {
      const result = await transcribeCloudFast({
        audioBytes,
        mimeType: parsed.data.mimeType,
        language: parsed.data.language === "auto" ? undefined : parsed.data.language,
        durationSeconds: parsed.data.durationSeconds
      }, {
        groqApiKey: config.GROQ_API_KEY,
        elevenLabsApiKey: config.ELEVENLABS_API_KEY,
        timeoutMs: config.CLOUD_FAST_TIMEOUT_MS,
        nodeEnv: config.NODE_ENV
      });

      app.log.info({
        event: "cloud_fast_transcribed",
        userId,
        clientSessionId: parsed.data.clientSessionId,
        fallbackUsed: result.fallbackUsed,
        provider: result.provider,
        model: result.model,
        durationMs: result.durationMs,
        audioSeconds: parsed.data.durationSeconds
      });

      return {
        text: result.text,
        fallbackUsed: result.fallbackUsed,
        mode: parsed.data.mode,
        privacyMode: "cloud-fast",
        contentRetention: "none"
      };
    } catch (error) {
      await releaseCloudFastSeconds(request, userId, parsed.data.durationSeconds).catch((releaseError: unknown) => {
        request.log.warn({
          event: "cloud_fast_quota_release_failed",
          userId,
          clientSessionId: parsed.data.clientSessionId,
          message: releaseError instanceof Error ? releaseError.message : "unknown quota release failure"
        });
      });
      request.log.warn({
        event: "cloud_fast_failed",
        userId,
        clientSessionId: parsed.data.clientSessionId,
        message: error instanceof Error ? error.message : "unknown cloud transcription failure"
      });
      return reply.code(502).send({
        error: "cloud_fast_transcription_failed",
        message: "Cloud Fast transcription failed. Try Local mode or retry in a moment."
      });
    }
  });
};

function userIdFromRequest(request: FastifyRequest) {
  return request.headers["x-user-id"]?.toString() || "anonymous";
}

async function readCloudFastEntitlement(request: FastifyRequest, userId: string) {
  const testEntitlement = testEntitlementFromRequest(request, userId);
  if (testEntitlement) return testEntitlement;

  const rows = await query<EntitlementRow>(
    `select user_id, plan, monthly_seconds_limit, monthly_seconds_used, renews_at
     from entitlements
     where user_id = $1
     limit 1`,
    [userId]
  );
  const row = rows[0];
  if (!row) return unavailableEntitlement(userId);
  return entitlementFromRow(row);
}

async function reserveCloudFastSeconds(request: FastifyRequest, userId: string, requestedSeconds: number) {
  const testEntitlement = testEntitlementFromRequest(request, userId);
  if (testEntitlement) {
    const nextUsed = testEntitlement.monthlySecondsUsed + Math.ceil(requestedSeconds);
    return {
      ...testEntitlement,
      available: nextUsed <= testEntitlement.monthlySecondsLimit,
      monthlySecondsUsed: nextUsed
    };
  }

  if (!pool) return unavailableEntitlement(userId);
  const seconds = Math.ceil(requestedSeconds);
  const result = await pool.query<EntitlementRow>(
    `update entitlements
     set monthly_seconds_used = monthly_seconds_used + $2,
         updated_at = now()
     where user_id = $1
       and plan = any($3::text[])
       and renews_at > now()
       and monthly_seconds_used + $2 <= monthly_seconds_limit
     returning user_id, plan, monthly_seconds_limit, monthly_seconds_used, renews_at`,
    [userId, seconds, [...CLOUD_FAST_PLANS]]
  );
  const row = result.rows[0];
  if (!row) {
    const current = await readCloudFastEntitlement(request, userId);
    return { ...current, available: false };
  }
  return entitlementFromRow(row);
}

function entitlementFromRow(row: EntitlementRow) {
  const renewsAtMs = new Date(row.renews_at).getTime();
  const planAllowsCloud = CLOUD_FAST_PLANS.has(row.plan);
  return {
    available: planAllowsCloud && renewsAtMs > Date.now() && row.monthly_seconds_used < row.monthly_seconds_limit,
    userId: row.user_id,
    plan: row.plan,
    monthlySecondsLimit: row.monthly_seconds_limit,
    monthlySecondsUsed: row.monthly_seconds_used,
    renewsAt: new Date(row.renews_at).toISOString()
  };
}

function unavailableEntitlement(userId: string) {
  return {
    available: false,
    userId,
    plan: "none",
    monthlySecondsLimit: config.CLOUD_FAST_MONTHLY_SECONDS,
    monthlySecondsUsed: 0,
    renewsAt: null as string | null
  };
}

function testEntitlementFromRequest(request: FastifyRequest, userId: string) {
  if (config.NODE_ENV === "production") return null;
  if (request.headers["x-cloud-fast-entitled"] !== "true") return null;
  const used = Number(request.headers["x-cloud-fast-used"] ?? 0);
  return {
    available: used < config.CLOUD_FAST_MONTHLY_SECONDS,
    userId,
    plan: "cloud-fast-monthly",
    monthlySecondsLimit: config.CLOUD_FAST_MONTHLY_SECONDS,
    monthlySecondsUsed: Number.isFinite(used) ? used : 0,
    renewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  };
}

function entitlementResponse(userId: string, entitlement: ReturnType<typeof unavailableEntitlement>) {
  return {
    userId,
    plan: entitlement.plan,
    available: entitlement.available,
    priceUsdMonthly: CLOUD_FAST_PRICE_USD_MONTHLY,
    monthlySecondsLimit: entitlement.monthlySecondsLimit,
    monthlySecondsUsed: entitlement.monthlySecondsUsed,
    renewsAt: entitlement.renewsAt,
    upgradeUrl: entitlement.available ? null : cloudFastUpgradeUrl(),
    billingPortalUrl: lemonSqueezyCustomerPortalUrl(),
    privacyNotice: "Cloud Fast uploads audio to cloud transcription providers for faster results."
  };
}

function cloudFastUpgradeUrl() {
  return `${config.APP_BASE_URL}/cloud-fast`;
}

function lemonSqueezyCustomerPortalUrl() {
  return "https://app.lemonsqueezy.com/my-orders";
}

async function releaseCloudFastSeconds(request: FastifyRequest, userId: string, requestedSeconds: number) {
  if (testEntitlementFromRequest(request, userId)) return;
  if (!pool) return;
  const seconds = Math.ceil(requestedSeconds);
  await pool.query(
    `update entitlements
     set monthly_seconds_used = greatest(monthly_seconds_used - $2, 0),
         updated_at = now()
     where user_id = $1
       and plan = any($3::text[])`,
    [userId, seconds, [...CLOUD_FAST_PLANS]]
  );
}

function decodeCloudFastAudio(audioBase64: string) {
  const normalized = audioBase64.trim();
  if (!normalized || normalized.length % 4 === 1) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return null;
  const bytes = Buffer.from(normalized, "base64");
  return bytes.byteLength > 0 ? bytes : null;
}
