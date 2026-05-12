import type { Tier } from "./desktopBridge";

export const TIER_DISPLAY: Record<Tier, { name: string; sub: string }> = {
  fast: { name: "Fast", sub: "Quicker · may sacrifice quality" },
  medium: { name: "Medium", sub: "Recommended" },
  slow: { name: "Quality", sub: "Most accurate · may take longer" }
};
