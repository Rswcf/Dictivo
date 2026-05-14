/**
 * Deep-link handling for `dictivo://...` URLs.
 *
 * The only supported flow at v1.0 is `dictivo://activate?key=<license-key>`,
 * fired from the activation email Lemon Squeezy sends after purchase. The
 * link opens Dictivo, hands off the key, and the app pre-fills the License
 * Settings panel so the user clicks Activate (or sees auto-activation).
 *
 * Parsing lives here, in a Tauri-free module, so it is unit-testable without
 * a desktop runtime.
 */

export type DeepLinkPayload =
  | { kind: "activate"; licenseKey: string }
  | { kind: "unknown"; url: string };

const VALID_SCHEMES = new Set(["dictivo:"]);
const ACTIVATION_HOST = "activate";
// Allow at most this many incoming activation links per minute. Real users
// click these once; anything higher suggests a malformed loop and we silently
// drop the rest until the timer resets.
const ACTIVATION_RATE_LIMIT_PER_MINUTE = 6;

/**
 * Parse a single deep-link URL. Returns null for anything that is not a
 * Dictivo deep link the app should react to.
 */
export function parseDeepLink(url: string): DeepLinkPayload | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (!VALID_SCHEMES.has(parsed.protocol)) return null;

  // For custom protocols the host slot may be empty depending on how the URL
  // was authored. `dictivo://activate?key=X` puts "activate" in host;
  // `dictivo:activate?key=X` puts it in pathname. Accept both.
  const route = (parsed.host || parsed.pathname.replace(/^\/+/, "")).toLowerCase();

  if (route === ACTIVATION_HOST) {
    const key = parsed.searchParams.get("key")?.trim();
    if (!key) return { kind: "unknown", url: trimmed };
    return { kind: "activate", licenseKey: key };
  }

  return { kind: "unknown", url: trimmed };
}

/**
 * In-process rate limiter shared across the deep-link listener and the
 * cold-start handoff. Keeps state in a module-level closure so a single
 * spammed `open dictivo://activate?...` cycle can't trigger an infinite
 * activation loop against Lemon Squeezy.
 */
export function createActivationRateLimiter(now: () => number = () => Date.now()) {
  const recent: number[] = [];

  return {
    allow(): boolean {
      const cutoff = now() - 60_000;
      while (recent.length > 0) {
        const head = recent[0]!;
        if (head >= cutoff) break;
        recent.shift();
      }
      if (recent.length >= ACTIVATION_RATE_LIMIT_PER_MINUTE) return false;
      recent.push(now());
      return true;
    }
  };
}
