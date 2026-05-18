export type CloudFastProviderId = "groq" | "elevenlabs";

export type CloudFastTranscribeInput = {
  audioBytes: Uint8Array;
  mimeType: string;
  language?: string;
  durationSeconds: number;
};

export type CloudFastTranscribeResult = {
  text: string;
  provider: CloudFastProviderId;
  model: string;
  durationMs: number;
};

type ProviderResponse = {
  text?: unknown;
};

export type CloudFastProviderRuntime = {
  groqApiKey?: string;
  elevenLabsApiKey?: string;
  timeoutMs: number;
  nodeEnv?: string;
};

class CloudFastProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly statusCode?: number
  ) {
    super(message);
  }
}

export type CloudFastRouteResult = CloudFastTranscribeResult & {
  fallbackUsed: boolean;
};

export async function transcribeCloudFast(
  input: CloudFastTranscribeInput,
  runtime: CloudFastProviderRuntime
): Promise<CloudFastRouteResult> {
  const primary = new GroqCloudFastProvider(apiKey("GROQ_API_KEY", runtime.groqApiKey, runtime.nodeEnv), runtime);
  const fallback = new ElevenLabsCloudFastProvider(
    apiKey("ELEVENLABS_API_KEY", runtime.elevenLabsApiKey, runtime.nodeEnv),
    runtime
  );

  try {
    const result = await primary.transcribe(input);
    assertUsableTranscript(result.text, input.durationSeconds);
    return { ...result, fallbackUsed: false };
  } catch (error) {
    if (!isRetryableProviderError(error)) throw error;
    const result = await fallback.transcribe(input);
    assertUsableTranscript(result.text, input.durationSeconds);
    return { ...result, fallbackUsed: true };
  }
}

function apiKey(name: "GROQ_API_KEY" | "ELEVENLABS_API_KEY", value?: string, nodeEnv?: string) {
  if (value) return value;
  if (nodeEnv === "test") return `test-${name.toLowerCase()}`;
  throw new CloudFastProviderError(`${name} is not configured.`, false);
}

class GroqCloudFastProvider {
  readonly provider = "groq" as const;
  readonly model = "whisper-large-v3";

  constructor(
    private readonly apiKey: string,
    private readonly runtime: CloudFastProviderRuntime
  ) {}

  async transcribe(input: CloudFastTranscribeInput): Promise<CloudFastTranscribeResult> {
    const started = Date.now();
    const form = new FormData();
    form.append("model", this.model);
    form.append("file", audioBlob(input), "dictivo.wav");
    if (input.language) form.append("language", input.language);
    form.append("response_format", "json");
    form.append("temperature", "0");

    const json = await postMultipart("https://api.groq.com/openai/v1/audio/transcriptions", this.apiKey, form, this.runtime);
    return {
      text: textFromProviderResponse(json, this.provider),
      provider: this.provider,
      model: this.model,
      durationMs: Date.now() - started
    };
  }
}

class ElevenLabsCloudFastProvider {
  readonly provider = "elevenlabs" as const;
  readonly model = "scribe_v2";

  constructor(
    private readonly apiKey: string,
    private readonly runtime: CloudFastProviderRuntime
  ) {}

  async transcribe(input: CloudFastTranscribeInput): Promise<CloudFastTranscribeResult> {
    const started = Date.now();
    const form = new FormData();
    form.append("model_id", this.model);
    form.append("file", audioBlob(input), "dictivo.wav");
    if (input.language) form.append("language_code", input.language);

    const json = await postMultipart(
      "https://api.elevenlabs.io/v1/speech-to-text",
      this.apiKey,
      form,
      this.runtime,
      "xi-api-key"
    );
    return {
      text: textFromProviderResponse(json, this.provider),
      provider: this.provider,
      model: this.model,
      durationMs: Date.now() - started
    };
  }
}

function audioBlob(input: CloudFastTranscribeInput) {
  return new Blob([Uint8Array.from(input.audioBytes).buffer], { type: input.mimeType || "audio/wav" });
}

async function postMultipart(
  url: string,
  apiKeyValue: string,
  form: FormData,
  runtime: CloudFastProviderRuntime,
  keyHeader: "authorization" | "xi-api-key" = "authorization"
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), runtime.timeoutMs);
  try {
    const headers: Record<string, string> =
      keyHeader === "authorization"
        ? { authorization: `Bearer ${apiKeyValue}` }
        : { "xi-api-key": apiKeyValue };
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: form,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new CloudFastProviderError(
        `Cloud transcription provider returned HTTP ${response.status}.`,
        response.status === 429 || response.status >= 500,
        response.status
      );
    }

    return await response.json() as ProviderResponse;
  } catch (error) {
    if (error instanceof CloudFastProviderError) throw error;
    const retryable = error instanceof Error && error.name === "AbortError";
    throw new CloudFastProviderError(
      retryable ? "Cloud transcription provider timed out." : "Cloud transcription provider request failed.",
      true
    );
  } finally {
    clearTimeout(timeout);
  }
}

function textFromProviderResponse(response: ProviderResponse, provider: CloudFastProviderId) {
  if (typeof response.text === "string") return response.text;
  throw new CloudFastProviderError(`Cloud transcription provider ${provider} returned no text.`, true);
}

function assertUsableTranscript(text: string, durationSeconds: number) {
  const trimmed = text.trim();
  if (!trimmed) throw new CloudFastProviderError("Cloud transcription returned an empty transcript.", true);
  if (durationSeconds >= 2 && trimmed.length < 2) {
    throw new CloudFastProviderError("Cloud transcription looked too short for the recorded audio.", true);
  }
}

function isRetryableProviderError(error: unknown) {
  return error instanceof CloudFastProviderError && error.retryable;
}
