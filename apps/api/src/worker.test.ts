import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkerApi, type DictivoWorkerEnv } from "./worker.js";

const audioBase64 = Buffer.from("wav").toString("base64");

describe("Cloudflare Worker API", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports Worker and D1 health metadata", async () => {
    const response = await createWorkerApi().fetch(new Request("https://api.dictivo.app/health"), testEnv());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      service: "dictivo-api",
      runtime: "cloudflare-workers",
      database: "d1",
      contentRetention: "none"
    });
  });

  it("allows the packaged Tauri desktop app to call Cloud Fast endpoints", async () => {
    const response = await createWorkerApi().fetch(
      new Request("https://api.dictivo.app/v1/cloud-fast/entitlement", {
        method: "OPTIONS",
        headers: {
          origin: "tauri://localhost",
          "access-control-request-method": "GET",
          "access-control-request-headers": "authorization"
        }
      }),
      testEnv()
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("tauri://localhost");
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("keeps unrelated origins out of Cloud Fast CORS", async () => {
    const response = await createWorkerApi().fetch(
      new Request("https://api.dictivo.app/v1/cloud-fast/entitlement", {
        method: "OPTIONS",
        headers: {
          origin: "https://malicious.example",
          "access-control-request-method": "GET",
          "access-control-request-headers": "authorization"
        }
      }),
      testEnv()
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("reports Cloud Fast entitlement without exposing provider choices", async () => {
    const response = await createWorkerApi().fetch(
      new Request("https://api.dictivo.app/v1/cloud-fast/entitlement", {
        headers: entitledHeaders()
      }),
      testEnv()
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      available: true,
      plan: "cloud-fast-monthly",
      priceUsdMonthly: "6.99",
      monthlySecondsLimit: 90000
    });
    expect(JSON.stringify(body)).not.toMatch(/groq|elevenlabs/i);
  });

  it("transcribes through Groq as the Worker primary provider", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ text: "Cloud transcript." }));

    const response = await createWorkerApi().fetch(
      new Request("https://api.dictivo.app/v1/cloud-fast/transcribe", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...entitledHeaders()
        },
        body: JSON.stringify(requestPayload())
      }),
      testEnv()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      text: "Cloud transcript.",
      fallbackUsed: false,
      privacyMode: "cloud-fast",
      contentRetention: "none"
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("api.groq.com/openai/v1/audio/transcriptions");
  });

  it("falls back to ElevenLabs from the Worker when Groq is retryable", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: "rate limited" }, 429))
      .mockResolvedValueOnce(jsonResponse({ text: "Backup transcript." }));

    const response = await createWorkerApi().fetch(
      new Request("https://api.dictivo.app/v1/cloud-fast/transcribe", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...entitledHeaders()
        },
        body: JSON.stringify(requestPayload())
      }),
      testEnv()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      text: "Backup transcript.",
      fallbackUsed: true
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain("api.elevenlabs.io/v1/speech-to-text");
  });

  it("rejects production Cloud Fast transcription without a signed session token", async () => {
    const response = await createWorkerApi().fetch(
      new Request("https://api.dictivo.app/v1/cloud-fast/transcribe", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "spoofed-user"
        },
        body: JSON.stringify(requestPayload())
      }),
      productionEnv()
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "cloud_fast_auth_required"
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("exchanges a Cloud Fast Lemon Squeezy license for a signed session token", async () => {
    const db = new FakeD1();
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      valid: true,
      error: null,
      license_key: {
        status: "active",
        expires_at: null
      },
      instance: {
        id: "instance-1"
      },
      meta: {
        product_id: 10,
        product_name: "Dictivo Cloud Fast",
        variant_id: 20,
        variant_name: "Monthly",
        customer_email: "person@example.com"
      }
    }));

    const response = await createWorkerApi().fetch(
      new Request("https://api.dictivo.app/v1/cloud-fast/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          licenseKey: "test-cloud-fast-license",
          instanceId: "instance-1"
        })
      }),
      productionEnv(db)
    );
    const body = await response.json() as { token?: string; available?: boolean; userId?: string };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      available: true,
      userId: expect.stringMatching(/^ls_/)
    });
    expect(body.token).toEqual(expect.any(String));
    expect(fetch).toHaveBeenCalledWith(
      "https://api.lemonsqueezy.com/v1/licenses/validate",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded"
        })
      })
    );
  });

  it("accepts a signed session token before transcribing in production", async () => {
    const db = new FakeD1();
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      valid: true,
      license_key: { status: "active" },
      instance: { id: "instance-1" },
      meta: {
        product_name: "Dictivo Cloud Fast",
        variant_name: "Monthly"
      }
    }));

    const sessionResponse = await createWorkerApi().fetch(
      new Request("https://api.dictivo.app/v1/cloud-fast/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          licenseKey: "test-cloud-fast-license",
          instanceId: "instance-1"
        })
      }),
      productionEnv(db)
    );
    const session = await sessionResponse.json() as { token: string };
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ text: "Cloud transcript." }));

    const response = await createWorkerApi().fetch(
      new Request("https://api.dictivo.app/v1/cloud-fast/transcribe", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.token}`
        },
        body: JSON.stringify(requestPayload())
      }),
      productionEnv(db)
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      text: "Cloud transcript.",
      fallbackUsed: false
    });
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain("api.groq.com/openai/v1/audio/transcriptions");
  });
});

function requestPayload(overrides: Record<string, unknown> = {}) {
  return {
    clientSessionId: "cloud-fast-session",
    audioBase64,
    mimeType: "audio/wav",
    durationSeconds: 3,
    language: "en",
    mode: "message",
    platform: "macos",
    appVersion: "0.3.4",
    ...overrides
  };
}

function entitledHeaders() {
  return {
    "x-user-id": "cloud-user",
    "x-cloud-fast-entitled": "true"
  };
}

function testEnv(): DictivoWorkerEnv {
  return {
    NODE_ENV: "test",
    APP_BASE_URL: "http://localhost:1420",
    GROQ_API_KEY: "test-groq",
    ELEVENLABS_API_KEY: "test-elevenlabs",
    CLOUD_FAST_TIMEOUT_MS: "10000",
    CLOUD_FAST_MONTHLY_SECONDS: "90000"
  };
}

function productionEnv(db?: FakeD1): DictivoWorkerEnv {
  return {
    ...testEnv(),
    NODE_ENV: "production",
    DB: db as DictivoWorkerEnv["DB"],
    CLOUD_FAST_SESSION_SECRET: "test-cloud-fast-session-secret"
  };
}

class FakeD1 {
  entitlement: {
    user_id: string;
    plan: string;
    monthly_seconds_limit: number;
    monthly_seconds_used: number;
    renews_at: string;
  } | null = null;

  prepare(query: string) {
    return new FakeD1Statement(this, query);
  }
}

class FakeD1Statement {
  private values: unknown[] = [];

  constructor(
    private readonly db: FakeD1,
    private readonly query: string
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T>() {
    const normalized = this.query.toLowerCase();
    if (normalized.includes("rate_limit_buckets")) {
      return { request_count: 1 } as T;
    }
    if (normalized.includes("insert into entitlements")) {
      const [userId, limit, renewsAt] = this.values;
      const existing = this.db.entitlement;
      this.db.entitlement = {
        user_id: String(userId),
        plan: "cloud-fast-monthly",
        monthly_seconds_limit: Number(limit),
        monthly_seconds_used: existing && new Date(existing.renews_at).getTime() > Date.now()
          ? existing.monthly_seconds_used
          : 0,
        renews_at: String(renewsAt)
      };
      return this.db.entitlement as T;
    }
    if (normalized.includes("update entitlements")) {
      const [seconds, userId] = this.values;
      if (!this.db.entitlement || this.db.entitlement.user_id !== userId) return null;
      const nextUsed = this.db.entitlement.monthly_seconds_used + Number(seconds);
      if (nextUsed > this.db.entitlement.monthly_seconds_limit) return null;
      this.db.entitlement = {
        ...this.db.entitlement,
        monthly_seconds_used: nextUsed
      };
      return this.db.entitlement as T;
    }
    if (normalized.includes("from entitlements")) {
      return this.db.entitlement as T;
    }
    return null;
  }

  async run() {
    return {};
  }
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}
