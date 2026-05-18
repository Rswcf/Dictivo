import { describe, it, expect } from "vitest";
import { createActivationRateLimiter, parseDeepLink } from "../src/lib/deepLink";

describe("parseDeepLink — activate flow", () => {
  it("parses a standard host-form activation URL", () => {
    const result = parseDeepLink("dictivo://activate?key=ABCD-1234-EFGH");
    expect(result).toEqual({ kind: "activate", licenseKey: "ABCD-1234-EFGH" });
  });

  it("accepts the pathname form for clients that strip the host", () => {
    const result = parseDeepLink("dictivo:activate?key=ABCD-1234");
    expect(result).toEqual({ kind: "activate", licenseKey: "ABCD-1234" });
  });

  it("normalizes leading slashes in the route", () => {
    const result = parseDeepLink("dictivo:///activate?key=X");
    expect(result).toEqual({ kind: "activate", licenseKey: "X" });
  });

  it("trims whitespace around the key", () => {
    const result = parseDeepLink("dictivo://activate?key=%20ABC%20");
    expect(result).toEqual({ kind: "activate", licenseKey: "ABC" });
  });

  it("parses Cloud Fast activation links separately", () => {
    const result = parseDeepLink("dictivo://activate-cloud-fast?key=CF-1234");
    expect(result).toEqual({ kind: "activate-cloud-fast", licenseKey: "CF-1234" });
  });

  it("returns unknown for an activation URL with no key", () => {
    const result = parseDeepLink("dictivo://activate");
    expect(result).toEqual({ kind: "unknown", url: "dictivo://activate" });
  });

  it("returns unknown for an unrecognized route", () => {
    const result = parseDeepLink("dictivo://something-else");
    expect(result?.kind).toBe("unknown");
  });
});

describe("parseDeepLink — rejection", () => {
  it("rejects empty input", () => {
    expect(parseDeepLink("")).toBeNull();
    expect(parseDeepLink("   ")).toBeNull();
  });

  it("rejects an HTTP URL", () => {
    expect(parseDeepLink("https://dictivo.app/activate?key=X")).toBeNull();
  });

  it("rejects a different custom scheme", () => {
    expect(parseDeepLink("notdictivo://activate?key=X")).toBeNull();
  });

  it("rejects malformed URLs", () => {
    expect(parseDeepLink("dictivo//not-a-url")).toBeNull();
  });
});

describe("createActivationRateLimiter", () => {
  it("allows the first 6 activations within one minute then blocks", () => {
    let clock = 1_000_000;
    const limiter = createActivationRateLimiter(() => clock);
    for (let i = 0; i < 6; i++) {
      expect(limiter.allow()).toBe(true);
    }
    expect(limiter.allow()).toBe(false);
  });

  it("re-allows once the sliding window passes", () => {
    let clock = 1_000_000;
    const limiter = createActivationRateLimiter(() => clock);
    for (let i = 0; i < 6; i++) limiter.allow();
    expect(limiter.allow()).toBe(false);
    clock += 61_000;
    expect(limiter.allow()).toBe(true);
  });
});
