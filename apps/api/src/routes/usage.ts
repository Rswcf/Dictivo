import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { query } from "../lib/db.js";
import { rejectForbiddenContentFields } from "../lib/privacyGuard.js";

const usageSchema = z.object({
  clientSessionId: z.string().min(1).max(120),
  event: z.enum(["dictation_completed", "local_engine_error", "local_mode_used"]),
  durationSeconds: z.number().nonnegative().max(24 * 60 * 60).default(0),
  wordCount: z.number().int().nonnegative().max(1_000_000).default(0),
  provider: z.literal("local-whisper"),
  privacyMode: z.literal("local-only")
}).strict();

export const usageRoutes: FastifyPluginAsync = async (app) => {
  app.post("/v1/usage/events", { preHandler: rejectForbiddenContentFields }, async (request, reply) => {
    const parsed = usageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid_usage_event",
        issues: parsed.error.issues
      });
    }

    const userId = request.headers["x-user-id"]?.toString() || "anonymous";
    const event = parsed.data;

    await query(
      `insert into usage_events
        (client_session_id, user_id, event, duration_seconds, word_count, provider, privacy_mode)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        event.clientSessionId,
        userId,
        event.event,
        event.durationSeconds,
        event.wordCount,
        event.provider,
        event.privacyMode
      ]
    );

    return { accepted: true };
  });
};
