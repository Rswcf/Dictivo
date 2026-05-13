import type { FastifyPluginAsync } from "fastify";
import { SUPPORTED_LANGUAGES } from "@dictivo/shared";
import { z } from "zod";
import { query } from "../lib/db.js";
import { rejectForbiddenContentFields } from "../lib/privacyGuard.js";

const sessionSchema = z.object({
  clientSessionId: z.string().min(1).max(120),
  provider: z.literal("local-whisper"),
  privacyMode: z.literal("local-only"),
  language: z.enum(SUPPORTED_LANGUAGES),
  source: z.literal("microphone"),
  mode: z.enum(["dictation", "email", "message", "raw", "prompt"]),
  platform: z.enum(["macos", "windows", "linux", "web"]).optional(),
  appVersion: z.string().max(60).optional()
}).strict();

export const transcriptionRoutes: FastifyPluginAsync = async (app) => {
  app.post("/v1/transcription/session", { preHandler: rejectForbiddenContentFields }, async (request, reply) => {
    const parsed = sessionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid_session_metadata",
        issues: parsed.error.issues
      });
    }

    const userId = request.headers["x-user-id"]?.toString() || "anonymous";
    const { clientSessionId, provider, privacyMode, language, source, mode, platform, appVersion } = parsed.data;

    await query(
      `insert into transcription_sessions
        (client_session_id, user_id, provider, privacy_mode, language, source, mode, platform, app_version)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (client_session_id) do nothing`,
      [clientSessionId, userId, provider, privacyMode, language, source, mode, platform ?? null, appVersion ?? null]
    );

    return {
      id: clientSessionId,
      relayAllowed: false,
      contentRetention: "none",
      createdAt: new Date().toISOString()
    };
  });
};
