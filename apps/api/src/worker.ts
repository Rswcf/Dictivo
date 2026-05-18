import { findForbiddenContentFields, TRANSCRIPTION_LANGUAGES } from "@dictivo/shared";
import { z } from "zod";
import { transcribeCloudFast } from "./lib/cloudFastProviders.js";

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type WorkerExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

export type DictivoWorkerEnv = {
  DB?: D1Database;
  APP_BASE_URL?: string;
  NODE_ENV?: "development" | "test" | "production";
  STRIPE_SECRET_KEY?: string;
  STRIPE_PRICE_PRO_MONTHLY?: string;
  STRIPE_PRICE_CLOUD_FAST_MONTHLY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  GROQ_API_KEY?: string;
  ELEVENLABS_API_KEY?: string;
  CLOUD_FAST_TIMEOUT_MS?: string;
  CLOUD_FAST_MONTHLY_SECONDS?: string;
  CLOUD_FAST_SESSION_SECRET?: string;
  LEMON_SQUEEZY_CLOUD_FAST_PRODUCT_IDS?: string;
  LEMON_SQUEEZY_CLOUD_FAST_VARIANT_IDS?: string;
};

type EntitlementRow = {
  user_id: string;
  plan: string;
  monthly_seconds_limit: number;
  monthly_seconds_used: number;
  renews_at: string;
};

type CloudFastEntitlement = {
  available: boolean;
  userId: string;
  plan: string;
  monthlySecondsLimit: number;
  monthlySecondsUsed: number;
  renewsAt: string | null;
};

type CloudFastIdentity = {
  userId: string;
  exp: number;
};

type LemonSqueezyLicenseValidation = {
  valid?: unknown;
  error?: unknown;
  license_key?: {
    status?: unknown;
    expires_at?: unknown;
  };
  instance?: {
    id?: unknown;
  } | null;
  meta?: {
    product_id?: unknown;
    product_name?: unknown;
    variant_id?: unknown;
    variant_name?: unknown;
    customer_email?: unknown;
  };
};

const METADATA_BODY_LIMIT_BYTES = 64 * 1024;
const CLOUD_FAST_BODY_LIMIT_BYTES = 36 * 1024 * 1024;
const CLOUD_FAST_PRICE_USD_MONTHLY = "6.99";
const CLOUD_FAST_PLANS = ["cloud-fast-monthly", "pro-monthly", "cloud-fast"] as const;
const CLOUD_FAST_SESSION_TTL_SECONDS = 60 * 60;
const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;
const DESKTOP_APP_CORS_ORIGINS = new Set([
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost"
]);

const sessionSchema = z.object({
  clientSessionId: z.string().min(1).max(120),
  provider: z.literal("local-whisper"),
  privacyMode: z.literal("local-only"),
  language: z.enum(TRANSCRIPTION_LANGUAGES),
  source: z.literal("microphone"),
  mode: z.enum(["dictation", "email", "message", "raw", "prompt"]),
  platform: z.enum(["macos", "windows", "linux", "web"]).optional(),
  appVersion: z.string().max(60).optional()
}).strict();

const usageSchema = z.object({
  clientSessionId: z.string().min(1).max(120),
  event: z.enum(["dictation_completed", "local_engine_error", "local_mode_used"]),
  durationSeconds: z.number().nonnegative().max(24 * 60 * 60).default(0),
  wordCount: z.number().int().nonnegative().max(1_000_000).default(0),
  provider: z.literal("local-whisper"),
  privacyMode: z.literal("local-only")
}).strict();

const checkoutSchema = z.object({
  email: z.string().email(),
  plan: z.enum(["pro-monthly", "cloud-fast-monthly"]).default("pro-monthly")
}).strict();

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

const cloudFastSessionSchema = z.object({
  licenseKey: z.string().trim().min(8).max(500),
  instanceId: z.string().trim().min(4).max(200)
}).strict();

class WorkerHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown>
  ) {
    super(String(body.error ?? "worker_http_error"));
  }
}

export function createWorkerApi() {
  return {
    async fetch(request: Request, env: DictivoWorkerEnv, ctx?: WorkerExecutionContext): Promise<Response> {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(request, env) });
      }

      try {
        return await routeRequest(request, env, ctx);
      } catch (error) {
        if (error instanceof WorkerHttpError) {
          return json(request, env, error.body, error.status);
        }

        console.warn("dictivo_worker_unhandled_error", error instanceof Error ? error.message : "unknown");
        return json(request, env, { error: "internal_server_error" }, 500);
      }
    }
  };
}

export default createWorkerApi();

async function routeRequest(request: Request, env: DictivoWorkerEnv, ctx?: WorkerExecutionContext) {
  const url = new URL(request.url);
  await enforceRateLimit(request, env, ctx);

  if (request.method === "GET" && url.pathname === "/health") {
    return json(request, env, {
      ok: true,
      service: "dictivo-api",
      runtime: "cloudflare-workers",
      database: "d1",
      contentRetention: "none"
    });
  }

  if (request.method === "GET" && url.pathname === "/v1/entitlements") {
    return handleEntitlements(request, env);
  }

  if (request.method === "POST" && url.pathname === "/v1/transcription/session") {
    return handleTranscriptionSession(request, env);
  }

  if (request.method === "POST" && url.pathname === "/v1/usage/events") {
    return handleUsageEvent(request, env);
  }

  if (request.method === "POST" && url.pathname === "/v1/billing/checkout") {
    return handleCheckout(request, env);
  }

  if (request.method === "POST" && url.pathname === "/v1/webhooks/stripe") {
    return handleStripeWebhook(request, env);
  }

  if (request.method === "GET" && url.pathname === "/v1/cloud-fast/entitlement") {
    return handleCloudFastEntitlement(request, env);
  }

  if (request.method === "POST" && url.pathname === "/v1/cloud-fast/session") {
    return handleCloudFastSession(request, env);
  }

  if (request.method === "POST" && url.pathname === "/v1/cloud-fast/transcribe") {
    return handleCloudFastTranscription(request, env);
  }

  return json(request, env, { error: "not_found" }, 404);
}

async function handleEntitlements(request: Request, env: DictivoWorkerEnv) {
  const userId = userIdFromRequest(request);
  const row = env.DB
    ? await env.DB.prepare(
        `select user_id, plan, monthly_seconds_limit, monthly_seconds_used, renews_at
         from entitlements
         where user_id = ?
         limit 1`
      ).bind(userId).first<EntitlementRow>()
    : null;
  const entitlement =
    row ??
    ({
      user_id: userId,
      plan: "trial",
      monthly_seconds_limit: 1_800,
      monthly_seconds_used: 0,
      renews_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    } satisfies EntitlementRow);

  return json(request, env, {
    userId: entitlement.user_id,
    plan: entitlement.plan,
    monthlySecondsLimit: toNumber(entitlement.monthly_seconds_limit, 1_800),
    monthlySecondsUsed: toNumber(entitlement.monthly_seconds_used, 0),
    renewsAt: entitlement.renews_at
  });
}

async function handleTranscriptionSession(request: Request, env: DictivoWorkerEnv) {
  const db = requireDb(env);
  const { body } = await readJsonBody(request, METADATA_BODY_LIMIT_BYTES);
  rejectForbiddenContentFields(body);
  const parsed = sessionSchema.safeParse(body);
  if (!parsed.success) {
    fail(400, { error: "invalid_session_metadata", issues: parsed.error.issues });
  }

  const userId = userIdFromRequest(request);
  const { clientSessionId, provider, privacyMode, language, source, mode, platform, appVersion } = parsed.data;
  await db.prepare(
    `insert or ignore into transcription_sessions
      (client_session_id, user_id, provider, privacy_mode, language, source, mode, platform, app_version)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(clientSessionId, userId, provider, privacyMode, language, source, mode, platform ?? null, appVersion ?? null).run();

  return json(request, env, {
    id: clientSessionId,
    relayAllowed: false,
    contentRetention: "none",
    createdAt: new Date().toISOString()
  });
}

async function handleUsageEvent(request: Request, env: DictivoWorkerEnv) {
  const db = requireDb(env);
  const { body } = await readJsonBody(request, METADATA_BODY_LIMIT_BYTES);
  rejectForbiddenContentFields(body);
  const parsed = usageSchema.safeParse(body);
  if (!parsed.success) {
    fail(400, { error: "invalid_usage_event", issues: parsed.error.issues });
  }

  const userId = userIdFromRequest(request);
  const event = parsed.data;
  await db.prepare(
    `insert into usage_events
      (client_session_id, user_id, event, duration_seconds, word_count, provider, privacy_mode)
     values (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    event.clientSessionId,
    userId,
    event.event,
    event.durationSeconds,
    event.wordCount,
    event.provider,
    event.privacyMode
  ).run();

  return json(request, env, { accepted: true });
}

async function handleCheckout(request: Request, env: DictivoWorkerEnv) {
  const { body } = await readJsonBody(request, METADATA_BODY_LIMIT_BYTES);
  rejectForbiddenContentFields(body);
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    fail(400, { error: "invalid_checkout_request", issues: parsed.error.issues });
  }

  const priceId = parsed.data.plan === "cloud-fast-monthly"
    ? env.STRIPE_PRICE_CLOUD_FAST_MONTHLY
    : env.STRIPE_PRICE_PRO_MONTHLY;

  if (!env.STRIPE_SECRET_KEY || !priceId) {
    return json(request, env, {
      mode: "test",
      checkoutUrl: `${appBaseUrl(env)}/billing/mock-success?plan=${parsed.data.plan}`
    });
  }

  const checkoutUrl = await createStripeCheckoutSession(env, parsed.data.email, priceId);
  return json(request, env, { mode: "stripe", checkoutUrl });
}

async function handleStripeWebhook(request: Request, env: DictivoWorkerEnv) {
  const db = requireDb(env);
  const { body, rawBody } = await readJsonBody(request, METADATA_BODY_LIMIT_BYTES);

  if (env.STRIPE_WEBHOOK_SECRET) {
    const signature = request.headers.get("stripe-signature");
    if (!signature || !(await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET))) {
      fail(400, {
        error: "invalid_stripe_signature",
        message: "Stripe webhook signature verification failed."
      });
    }
  }

  rejectForbiddenContentFields(body);
  const event = body as { id?: unknown; type?: unknown };
  await db.prepare(
    `insert or ignore into billing_events (stripe_event_id, event_type, received_at)
     values (?, ?, datetime('now'))`
  ).bind(
    typeof event.id === "string" ? event.id : `local_${Date.now()}`,
    typeof event.type === "string" ? event.type : "unknown"
  ).run();

  return json(request, env, { received: true });
}

async function handleCloudFastEntitlement(request: Request, env: DictivoWorkerEnv) {
  const identity = await optionalCloudFastIdentity(request, env);
  const userId = identity?.userId ?? userIdFromRequest(request);
  const entitlement = await readCloudFastEntitlement(request, env, userId);
  return json(request, env, entitlementResponse(env, userId, entitlement));
}

async function handleCloudFastSession(request: Request, env: DictivoWorkerEnv) {
  const db = requireDb(env);
  const { body } = await readJsonBody(request, METADATA_BODY_LIMIT_BYTES);
  const parsed = cloudFastSessionSchema.safeParse(body);
  if (!parsed.success) {
    fail(400, { error: "invalid_cloud_fast_session_request", issues: parsed.error.issues });
  }

  const validation = await validateLemonSqueezyLicense(parsed.data.licenseKey, parsed.data.instanceId);
  if (validation.valid !== true || !licenseStatusAllowsCloudFast(validation)) {
    fail(402, {
      error: "cloud_fast_subscription_required",
      message: "Cloud Fast requires an active $6.99/month subscription.",
      upgradeUrl: cloudFastUpgradeUrl(env)
    });
  }
  if (!licenseProductAllowsCloudFast(env, validation)) {
    fail(402, {
      error: "cloud_fast_subscription_required",
      message: "This license does not include Cloud Fast.",
      upgradeUrl: cloudFastUpgradeUrl(env)
    });
  }

  const userId = await cloudFastUserIdForLicense(parsed.data.licenseKey);
  const entitlement = await upsertCloudFastEntitlementForSession(db, env, userId);
  const token = await signCloudFastToken(env, userId);

  return json(request, env, {
    token: token.value,
    tokenType: "Bearer",
    expiresAt: token.expiresAt,
    ...entitlementResponse(env, userId, entitlement)
  });
}

async function handleCloudFastTranscription(request: Request, env: DictivoWorkerEnv) {
  const identity = await requireCloudFastIdentity(request, env);
  const { body } = await readJsonBody(request, CLOUD_FAST_BODY_LIMIT_BYTES);
  const parsed = cloudFastSchema.safeParse(body);
  if (!parsed.success) {
    fail(400, { error: "invalid_cloud_fast_request", issues: parsed.error.issues });
  }

  const userId = identity.userId;
  const entitlement = await readCloudFastEntitlement(request, env, userId);
  if (!entitlement.available) {
    fail(402, {
      error: "cloud_fast_subscription_required",
      message: "Cloud Fast requires an active $6.99/month subscription.",
      upgradeUrl: cloudFastUpgradeUrl(env)
    });
  }

  const audioBytes = decodeCloudFastAudio(parsed.data.audioBase64);
  if (!audioBytes) {
    fail(400, {
      error: "invalid_cloud_fast_audio",
      message: "Audio must be valid base64."
    });
  }

  const reserved = await reserveCloudFastSeconds(request, env, userId, parsed.data.durationSeconds);
  if (!reserved.available) {
    fail(402, {
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
      groqApiKey: env.GROQ_API_KEY,
      elevenLabsApiKey: env.ELEVENLABS_API_KEY,
      timeoutMs: cloudFastTimeoutMs(env),
      nodeEnv: nodeEnv(env)
    });

    console.info("cloud_fast_transcribed", {
      userId,
      clientSessionId: parsed.data.clientSessionId,
      fallbackUsed: result.fallbackUsed,
      provider: result.provider,
      model: result.model,
      durationMs: result.durationMs,
      audioSeconds: parsed.data.durationSeconds
    });

    return json(request, env, {
      text: result.text,
      fallbackUsed: result.fallbackUsed,
      mode: parsed.data.mode,
      privacyMode: "cloud-fast",
      contentRetention: "none"
    });
  } catch (error) {
    await releaseCloudFastSeconds(request, env, userId, parsed.data.durationSeconds).catch((releaseError: unknown) => {
      console.warn("cloud_fast_quota_release_failed", {
        userId,
        clientSessionId: parsed.data.clientSessionId,
        message: releaseError instanceof Error ? releaseError.message : "unknown quota release failure"
      });
    });
    console.warn("cloud_fast_failed", {
      userId,
      clientSessionId: parsed.data.clientSessionId,
      message: error instanceof Error ? error.message : "unknown cloud transcription failure"
    });
    fail(502, {
      error: "cloud_fast_transcription_failed",
      message: "Cloud Fast transcription failed. Try Local mode or retry in a moment."
    });
  }
}

async function enforceRateLimit(request: Request, env: DictivoWorkerEnv, ctx?: WorkerExecutionContext) {
  if (!env.DB || nodeEnv(env) === "test") return;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const bucketKey = `${request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "local"}:${Math.floor(nowSeconds / 60)}`;
  const row = await env.DB.prepare(
    `insert into rate_limit_buckets (bucket_key, request_count, expires_at)
     values (?, 1, ?)
     on conflict(bucket_key) do update set request_count = request_count + 1
     returning request_count`
  ).bind(bucketKey, nowSeconds + 180).first<{ request_count: number }>();

  if (ctx && Math.random() < 0.01) {
    ctx.waitUntil(env.DB.prepare("delete from rate_limit_buckets where expires_at < ?").bind(nowSeconds).run());
  }

  if (toNumber(row?.request_count, 1) > 120) {
    fail(429, { error: "rate_limited" });
  }
}

async function createStripeCheckoutSession(env: DictivoWorkerEnv, email: string, priceId: string) {
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("customer_email", email);
  params.set("line_items[0][price]", priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("success_url", `${appBaseUrl(env)}/billing/success?session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${appBaseUrl(env)}/billing/cancel`);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: params
  });

  if (!response.ok) {
    fail(502, { error: "stripe_checkout_failed" });
  }

  const data = await response.json() as { url?: unknown };
  if (typeof data.url !== "string") {
    fail(502, { error: "stripe_checkout_failed" });
  }
  return data.url;
}

async function validateLemonSqueezyLicense(licenseKey: string, instanceId: string): Promise<LemonSqueezyLicenseValidation> {
  const body = new URLSearchParams();
  body.set("license_key", licenseKey);
  body.set("instance_id", instanceId);

  const response = await fetch("https://api.lemonsqueezy.com/v1/licenses/validate", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });

  const payload = await response.json().catch(() => ({})) as LemonSqueezyLicenseValidation;
  if (!response.ok) return { valid: false, error: payload.error ?? `license_validate_http_${response.status}` };
  return payload;
}

function licenseStatusAllowsCloudFast(validation: LemonSqueezyLicenseValidation) {
  const status = String(validation.license_key?.status ?? "").toLowerCase();
  return status === "active";
}

function licenseProductAllowsCloudFast(env: DictivoWorkerEnv, validation: LemonSqueezyLicenseValidation) {
  const productIds = csvSet(env.LEMON_SQUEEZY_CLOUD_FAST_PRODUCT_IDS);
  const variantIds = csvSet(env.LEMON_SQUEEZY_CLOUD_FAST_VARIANT_IDS);
  const productId = String(validation.meta?.product_id ?? "");
  const variantId = String(validation.meta?.variant_id ?? "");

  if (productIds.size > 0 || variantIds.size > 0) {
    return productIds.has(productId) || variantIds.has(variantId);
  }

  const productName = String(validation.meta?.product_name ?? "");
  const variantName = String(validation.meta?.variant_name ?? "");
  return /cloud[\s_-]*fast/i.test(`${productName} ${variantName}`);
}

async function upsertCloudFastEntitlementForSession(db: D1Database, env: DictivoWorkerEnv, userId: string) {
  const periodEnd = nextCloudFastQuotaResetIso();
  const row = await db.prepare(
    `insert into entitlements
       (user_id, plan, monthly_seconds_limit, monthly_seconds_used, renews_at, created_at, updated_at)
     values (?, 'cloud-fast-monthly', ?, 0, ?, datetime('now'), datetime('now'))
     on conflict(user_id) do update set
       plan = 'cloud-fast-monthly',
       monthly_seconds_limit = excluded.monthly_seconds_limit,
       monthly_seconds_used = case
         when datetime(entitlements.renews_at) <= datetime('now') then 0
         else entitlements.monthly_seconds_used
       end,
       renews_at = case
         when datetime(entitlements.renews_at) <= datetime('now') then excluded.renews_at
         else entitlements.renews_at
       end,
       updated_at = datetime('now')
     returning user_id, plan, monthly_seconds_limit, monthly_seconds_used, renews_at`
  ).bind(userId, cloudFastMonthlySeconds(env), periodEnd).first<EntitlementRow>();

  if (!row) return unavailableEntitlement(env, userId);
  return entitlementFromRow(row);
}

async function requireCloudFastIdentity(request: Request, env: DictivoWorkerEnv) {
  const identity = await optionalCloudFastIdentity(request, env);
  if (!identity) {
    fail(401, {
      error: "cloud_fast_auth_required",
      message: "Cloud Fast requires an active Cloud Fast license session."
    });
  }
  return identity;
}

async function optionalCloudFastIdentity(request: Request, env: DictivoWorkerEnv): Promise<CloudFastIdentity | null> {
  const fallbackUserId = userIdFromRequest(request);
  if (testEntitlementFromRequest(request, env, fallbackUserId)) {
    return {
      userId: fallbackUserId,
      exp: Math.floor(Date.now() / 1000) + CLOUD_FAST_SESSION_TTL_SECONDS
    };
  }

  const token = bearerTokenFromRequest(request);
  if (!token) return null;
  return verifyCloudFastToken(env, token);
}

async function signCloudFastToken(env: DictivoWorkerEnv, userId: string) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = issuedAt + CLOUD_FAST_SESSION_TTL_SECONDS;
  const payload = base64UrlEncodeString(JSON.stringify({
    userId,
    iat: issuedAt,
    exp: expiresAtSeconds
  }));
  const signature = await hmacSha256Hex(payload, cloudFastSessionSecret(env));

  return {
    value: `${payload}.${signature}`,
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString()
  };
}

async function verifyCloudFastToken(env: DictivoWorkerEnv, token: string): Promise<CloudFastIdentity | null> {
  const [payloadPart, signaturePart] = token.split(".", 2);
  if (!payloadPart || !signaturePart) return null;
  const expected = await hmacSha256Hex(payloadPart, cloudFastSessionSecret(env));
  if (!safeEqualHex(signaturePart, expected)) return null;

  try {
    const payload = JSON.parse(base64UrlDecodeToString(payloadPart)) as Partial<CloudFastIdentity>;
    if (typeof payload.userId !== "string" || !payload.userId) return null;
    if (typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return { userId: payload.userId, exp: payload.exp };
  } catch {
    return null;
  }
}

async function cloudFastUserIdForLicense(licenseKey: string) {
  return `ls_${(await sha256Hex(licenseKey)).slice(0, 32)}`;
}

async function readCloudFastEntitlement(request: Request, env: DictivoWorkerEnv, userId: string): Promise<CloudFastEntitlement> {
  const testEntitlement = testEntitlementFromRequest(request, env, userId);
  if (testEntitlement) return testEntitlement;

  if (!env.DB) return unavailableEntitlement(env, userId);
  const row = await env.DB.prepare(
    `select user_id, plan, monthly_seconds_limit, monthly_seconds_used, renews_at
     from entitlements
     where user_id = ?
     limit 1`
  ).bind(userId).first<EntitlementRow>();

  if (!row) return unavailableEntitlement(env, userId);
  return entitlementFromRow(row);
}

async function reserveCloudFastSeconds(
  request: Request,
  env: DictivoWorkerEnv,
  userId: string,
  requestedSeconds: number
): Promise<CloudFastEntitlement> {
  const testEntitlement = testEntitlementFromRequest(request, env, userId);
  if (testEntitlement) {
    const nextUsed = testEntitlement.monthlySecondsUsed + Math.ceil(requestedSeconds);
    return {
      ...testEntitlement,
      available: nextUsed <= testEntitlement.monthlySecondsLimit,
      monthlySecondsUsed: nextUsed
    };
  }

  if (!env.DB) return unavailableEntitlement(env, userId);
  const seconds = Math.ceil(requestedSeconds);
  const row = await env.DB.prepare(
    `update entitlements
     set monthly_seconds_used = monthly_seconds_used + ?,
         updated_at = datetime('now')
     where user_id = ?
       and plan in (?, ?, ?)
       and datetime(renews_at) > datetime('now')
       and monthly_seconds_used + ? <= monthly_seconds_limit
     returning user_id, plan, monthly_seconds_limit, monthly_seconds_used, renews_at`
  ).bind(seconds, userId, ...CLOUD_FAST_PLANS, seconds).first<EntitlementRow>();

  if (!row) {
    const current = await readCloudFastEntitlement(request, env, userId);
    return { ...current, available: false };
  }
  return entitlementFromRow(row);
}

async function releaseCloudFastSeconds(
  request: Request,
  env: DictivoWorkerEnv,
  userId: string,
  requestedSeconds: number
) {
  if (testEntitlementFromRequest(request, env, userId)) return;
  if (!env.DB) return;
  const seconds = Math.ceil(requestedSeconds);
  await env.DB.prepare(
    `update entitlements
     set monthly_seconds_used = max(monthly_seconds_used - ?, 0),
         updated_at = datetime('now')
     where user_id = ?
       and plan in (?, ?, ?)`
  ).bind(seconds, userId, ...CLOUD_FAST_PLANS).run();
}

function entitlementFromRow(row: EntitlementRow): CloudFastEntitlement {
  const renewsAt = dateFromD1Timestamp(row.renews_at);
  const renewsAtMs = renewsAt.getTime();
  const monthlySecondsLimit = toNumber(row.monthly_seconds_limit, cloudFastMonthlySeconds({}));
  const monthlySecondsUsed = toNumber(row.monthly_seconds_used, 0);
  const planAllowsCloud = CLOUD_FAST_PLANS.includes(row.plan as (typeof CLOUD_FAST_PLANS)[number]);
  return {
    available: planAllowsCloud && renewsAtMs > Date.now() && monthlySecondsUsed < monthlySecondsLimit,
    userId: row.user_id,
    plan: row.plan,
    monthlySecondsLimit,
    monthlySecondsUsed,
    renewsAt: renewsAt.toISOString()
  };
}

function unavailableEntitlement(env: DictivoWorkerEnv, userId: string): CloudFastEntitlement {
  return {
    available: false,
    userId,
    plan: "none",
    monthlySecondsLimit: cloudFastMonthlySeconds(env),
    monthlySecondsUsed: 0,
    renewsAt: null
  };
}

function testEntitlementFromRequest(request: Request, env: DictivoWorkerEnv, userId: string): CloudFastEntitlement | null {
  if (nodeEnv(env) === "production") return null;
  if (request.headers.get("x-cloud-fast-entitled") !== "true") return null;
  const used = Number(request.headers.get("x-cloud-fast-used") ?? 0);
  const monthlySecondsLimit = cloudFastMonthlySeconds(env);
  return {
    available: used < monthlySecondsLimit,
    userId,
    plan: "cloud-fast-monthly",
    monthlySecondsLimit,
    monthlySecondsUsed: Number.isFinite(used) ? used : 0,
    renewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  };
}

function entitlementResponse(env: DictivoWorkerEnv, userId: string, entitlement: CloudFastEntitlement) {
  return {
    userId,
    plan: entitlement.plan,
    available: entitlement.available,
    priceUsdMonthly: CLOUD_FAST_PRICE_USD_MONTHLY,
    monthlySecondsLimit: entitlement.monthlySecondsLimit,
    monthlySecondsUsed: entitlement.monthlySecondsUsed,
    renewsAt: entitlement.renewsAt,
    upgradeUrl: entitlement.available ? null : cloudFastUpgradeUrl(env),
    billingPortalUrl: lemonSqueezyCustomerPortalUrl(),
    privacyNotice: "Cloud Fast uploads audio to cloud transcription providers for faster results."
  };
}

function lemonSqueezyCustomerPortalUrl() {
  return "https://app.lemonsqueezy.com/my-orders";
}

function rejectForbiddenContentFields(body: unknown) {
  const matches = findForbiddenContentFields(body);
  if (!matches.length) return;
  fail(400, {
    error: "content_fields_not_allowed",
    message: "This API accepts metadata only. Audio, transcripts, summaries, snippets, dictionaries, and credentials must stay local.",
    fields: matches
  });
}

async function readJsonBody(request: Request, maxBytes: number) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    fail(413, { error: "body_too_large" });
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > maxBytes) {
    fail(413, { error: "body_too_large" });
  }

  if (!rawBody) return { body: null, rawBody };
  try {
    return { body: JSON.parse(rawBody) as unknown, rawBody };
  } catch {
    fail(400, { error: "invalid_json" });
  }
}

async function verifyStripeSignature(rawBody: string, signatureHeader: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const parsed = parseStripeSignatureHeader(signatureHeader);
  if (!parsed || Math.abs(nowSeconds - parsed.timestamp) > STRIPE_SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = await hmacSha256Hex(`${parsed.timestamp}.${rawBody}`, secret);
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

async function hmacSha256Hex(message: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(message: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqualHex(actual: string, expected: string) {
  if (actual.length !== expected.length || actual.length % 2 !== 0) return false;
  let diff = 0;
  for (let index = 0; index < actual.length; index += 1) {
    diff |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return diff === 0;
}

function decodeCloudFastAudio(audioBase64: string) {
  const normalized = audioBase64.trim();
  if (!normalized || normalized.length % 4 === 1) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return null;

  try {
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.byteLength > 0 ? bytes : null;
  } catch {
    return null;
  }
}

function bearerTokenFromRequest(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }
  return request.headers.get("x-cloud-fast-token")?.trim() || "";
}

function base64UrlEncodeString(value: string) {
  return btoa(value)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function base64UrlDecodeToString(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

function json(request: Request, env: DictivoWorkerEnv, body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: corsHeaders(request, env)
  });
}

function corsHeaders(request: Request, env: DictivoWorkerEnv) {
  const headers = new Headers();
  headers.set("vary", "Origin");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set(
    "access-control-allow-headers",
    "authorization, content-type, stripe-signature, x-cloud-fast-token, x-user-id, x-cloud-fast-entitled, x-cloud-fast-used"
  );

  const origin = request.headers.get("origin");
  if (origin && isAllowedCorsOrigin(origin, env)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
  }
  return headers;
}

function isAllowedCorsOrigin(origin: string, env: DictivoWorkerEnv) {
  return origin === appBaseUrl(env) || DESKTOP_APP_CORS_ORIGINS.has(origin);
}

function requireDb(env: DictivoWorkerEnv) {
  if (!env.DB) {
    fail(500, { error: "d1_database_not_configured" });
  }
  return env.DB;
}

function fail(status: number, body: Record<string, unknown>): never {
  throw new WorkerHttpError(status, body);
}

function userIdFromRequest(request: Request) {
  return request.headers.get("x-user-id") || "anonymous";
}

function appBaseUrl(env: DictivoWorkerEnv) {
  return env.APP_BASE_URL || "http://localhost:1420";
}

function cloudFastUpgradeUrl(env: DictivoWorkerEnv) {
  return `${appBaseUrl(env)}/cloud-fast`;
}

function nodeEnv(env: DictivoWorkerEnv) {
  return env.NODE_ENV || "development";
}

function cloudFastTimeoutMs(env: DictivoWorkerEnv) {
  const value = Number(env.CLOUD_FAST_TIMEOUT_MS ?? 10_000);
  return Number.isFinite(value) && value > 0 ? value : 10_000;
}

function cloudFastMonthlySeconds(env: Pick<DictivoWorkerEnv, "CLOUD_FAST_MONTHLY_SECONDS">) {
  const value = Number(env.CLOUD_FAST_MONTHLY_SECONDS ?? 90_000);
  return Number.isFinite(value) && value > 0 ? value : 90_000;
}

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateFromD1Timestamp(value: string) {
  if (value.includes("T") || /[zZ]$/.test(value)) return new Date(value);
  return new Date(`${value.replace(" ", "T")}Z`);
}

function cloudFastSessionSecret(env: DictivoWorkerEnv) {
  if (env.CLOUD_FAST_SESSION_SECRET) return env.CLOUD_FAST_SESSION_SECRET;
  if (nodeEnv(env) === "test") return "test-cloud-fast-session-secret";
  fail(500, { error: "cloud_fast_session_secret_not_configured" });
}

function csvSet(value?: string) {
  return new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean));
}

function nextCloudFastQuotaResetIso(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0)).toISOString();
}
