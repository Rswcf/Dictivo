import type { FastifyPluginAsync } from "fastify";
import { query } from "../lib/db.js";

type EntitlementRow = {
  user_id: string;
  plan: string;
  monthly_seconds_limit: number;
  monthly_seconds_used: number;
  renews_at: Date | string;
};

export const entitlementsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/entitlements", async (request) => {
    const userId = request.headers["x-user-id"]?.toString() || "anonymous";
    const rows = await query<EntitlementRow>(
      `select user_id, plan, monthly_seconds_limit, monthly_seconds_used, renews_at
       from entitlements
       where user_id = $1
       limit 1`,
      [userId]
    );

    const entitlement =
      rows[0] ??
      ({
        user_id: userId,
        plan: "trial",
        monthly_seconds_limit: 1_800,
        monthly_seconds_used: 0,
        renews_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
      } satisfies EntitlementRow);

    return {
      userId: entitlement.user_id,
      plan: entitlement.plan,
      monthlySecondsLimit: entitlement.monthly_seconds_limit,
      monthlySecondsUsed: entitlement.monthly_seconds_used,
      renewsAt: entitlement.renews_at
    };
  });
};
