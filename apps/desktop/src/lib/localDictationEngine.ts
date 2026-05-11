import type { FinalizeTranscriptOptions, Snippet, SupportedLanguage } from "@dictivo/shared";
import { transcribePrivateFast, type PrivateFastProfile } from "./desktopBridge";
import { polishLocalTranscript } from "./localPolish";
import { DEFAULT_LOCAL_PROCESSING, type LocalProcessingSettings } from "./settingsStore";

export type LocalDictationOptions = {
  language: SupportedLanguage;
  dictionary: string[];
  snippets: Array<Pick<Snippet, "trigger" | "replacement">>;
  mode: FinalizeTranscriptOptions["mode"];
  profile: PrivateFastProfile;
  localProcessing?: LocalProcessingSettings;
};

export type LocalDictationResult = {
  rawText: string;
  finalizedText: string;
  profileUsed: PrivateFastProfile;
  fallbackUsed: boolean;
  slowWarning?: string;
};

export async function runLocalDictation(audio: Blob, options: LocalDictationOptions): Promise<LocalDictationResult> {
  const rawResult = await transcribeWithProfileFallback(audio, options);
  const finalizedText = polishLocalTranscript(rawResult.text, {
    language: options.language,
    mode: options.mode,
    dictionary: options.dictionary,
    snippets: options.snippets,
    processing: options.localProcessing ?? DEFAULT_LOCAL_PROCESSING
  });

  return {
    rawText: rawResult.text,
    finalizedText,
    profileUsed: rawResult.profileUsed,
    fallbackUsed: rawResult.fallbackUsed,
    slowWarning: rawResult.slowWarning
  };
}

async function transcribeWithProfileFallback(audio: Blob, options: LocalDictationOptions) {
  try {
    const started = performance.now();
    const text = await transcribePrivateFast(audio, {
      language: options.language,
      mode: options.mode,
      source: "microphone",
      profile: options.profile,
      dictionary: options.dictionary,
      snippets: options.snippets
    });
    const durationMs = performance.now() - started;
    return {
      text,
      profileUsed: options.profile,
      fallbackUsed: false,
      slowWarning:
        durationMs > 30_000 && options.profile !== "fast"
          ? "This local pass was slow. Switch to Fast profile or a lighter model for lower latency."
          : undefined
    };
  } catch (error) {
    if (options.profile === "fast") throw error;

    return {
      text: await transcribePrivateFast(audio, {
        language: options.language,
        mode: options.mode,
        source: "microphone",
        profile: "fast",
        dictionary: options.dictionary,
        snippets: options.snippets
      }),
      profileUsed: "fast" as const,
      fallbackUsed: true
    };
  }
}
